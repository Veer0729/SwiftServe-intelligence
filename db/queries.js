// Add this helper near the top or inside queries.js
const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'project.db');

function simulateEscalations(db) {
    // SYSTEM RULE 1: Automatically move breached, open tickets into an
    // 'Escalated' status. This actually mutates the row now (it previously
    // only existed as a comment and never ran).
    // NOTE: requires schema.sql's work_orders.status CHECK constraint to
    // include 'Escalated' as an allowed value, or this UPDATE will throw.
    const escalationResult = db.prepare(`
        UPDATE work_orders
        SET status = 'Escalated'
        WHERE status NOT IN ('Completed', 'Escalated') AND (
            (priority = 'Critical' AND resolution_time_hours > 8) OR
            (priority = 'High' AND resolution_time_hours > 48)
        )
    `).run();

    // SYSTEM RULE 2: Find zones with 3+ breached/escalated tickets to
    // trigger a system-wide dashboard banner.
    const criticalZones = db.prepare(`
        SELECT location as zone, COUNT(*) as breach_count 
        FROM work_orders 
        WHERE status = 'Escalated'
        GROUP BY location
        HAVING breach_count >= 3
    `).all();

    // SYSTEM RULE 3 (data-honesty note): our dataset has NO invoice/billing
    // table — there is no invoice amount, invoice date, or payment status
    // anywhere in the source CSVs. What follows is a deliberate proxy, not
    // real invoice data: work orders that are still open long past their
    // due_date, using estimated_cost_inr as a stand-in for "money at risk."
    // Named accordingly so it's never mistaken for real billing data.
    const overdueHighCostWorkOrders = db.prepare(`
        SELECT customer_name, estimated_cost_inr as at_risk_amount, due_date
        FROM work_orders
        WHERE status != 'Completed' 
          AND julianday('now') - julianday(due_date) > 45
    `).all();

    return {
        critical_zones: criticalZones,
        overdue_high_cost_work_orders: overdueHighCostWorkOrders,
        escalated_count: escalationResult.changes
    };
}

function getOpsSnapshot() {
    const db = new Database(dbPath);
    
    // Run the automatic escalation rules
    const escalations = simulateEscalations(db);

    // 1. ACT MODE: Get critical alerts, bad SLAs, and unresolved high-priority jobs
    const criticalAlerts = db.prepare(`
        SELECT id, equipment_name, critical_alerts, location 
        FROM equipment 
        WHERE critical_alerts > 2
    `).all();

    const slaBreaches = db.prepare(`
        SELECT customer_name, sla_breaches_this_month, sla_compliance_percent 
        FROM sla_metrics 
        WHERE sla_compliance_percent < 95.0 OR sla_breaches_this_month > 0
    `).all();

    const urgentWorkOrders = db.prepare(`
        SELECT id, customer_name, location, priority, status, due_date,
               CASE
                 WHEN julianday('now') - julianday(due_date) > 0 THEN 'BREACHED'
                 WHEN priority = 'Critical' THEN 'CRITICAL'
                 ELSE 'AT RISK'
               END as sla_status
        FROM work_orders 
        WHERE priority IN ('High', 'Critical') AND status != 'Completed'
    `).all();

    // 2. OBSERVE MODE: Grab high-performing active technicians
    const technicianPerformance = db.prepare(`
        SELECT id, name, status, 
               (CAST(completed_assignments AS REAL) / NULLIF(total_assignments, 0)) * 100 as completion_rate,
               avg_response_time_hours
        FROM technicians
        WHERE status = 'Active'
        ORDER BY completion_rate DESC
    `).all();

    // 3. DASHBOARD KPIs — computed here in SQL, not by the LLM, so the
    // numbers on screen are deterministic and auditable.
    const activeTicketsRow = db.prepare(`
        SELECT COUNT(*) as count FROM work_orders WHERE status NOT IN ('Completed')
    `).get();

    const avgSlaRow = db.prepare(`
        SELECT AVG(sla_compliance_percent) as avg_compliance FROM sla_metrics
    `).get();

    const atRiskValueRow = db.prepare(`
        SELECT COALESCE(SUM(estimated_cost_inr), 0) as total
        FROM work_orders
        WHERE status != 'Completed' AND julianday('now') - julianday(due_date) > 45
    `).get();

    const kpis = {
        active_tickets: activeTicketsRow.count,
        avg_sla_compliance_percent: avgSlaRow.avg_compliance,
        // Proxy metric, same honesty note as simulateEscalations() — this is
        // NOT real invoice/billing revenue, just overdue work-order cost.
        at_risk_work_order_value_inr: atRiskValueRow.total,
        // No inventory/stock table exists in this dataset. This counts
        // equipment rows with elevated critical_alerts as the closest real
        // substitute, and must be labeled "Equipment Alerts" on the
        // dashboard, never "Stock Alerts" (there is no stock data).
        equipment_alerts_count: criticalAlerts.length
    };

    db.close();

    // Return the clean, plain JSON snapshot of truth including our new escalation engine data
    return {
        timestamp: new Date().toISOString(),
        kpis,
        act_metrics: {
            critical_equipment_alerts: criticalAlerts,
            sla_violations: slaBreaches,
            unresolved_high_priority_orders: urgentWorkOrders
        },
        escalation_alerts: { // <--- Added for Deliverable 5
            zone_breach_alerts: escalations.critical_zones,
            // Proxy metric — see comment in simulateEscalations(). Not real
            // invoice/billing data; our source CSVs have no invoice table.
            overdue_high_cost_work_orders: escalations.overdue_high_cost_work_orders,
            newly_escalated_this_run: escalations.escalated_count
        },
        observe_metrics: {
            active_technician_performance: technicianPerformance
        }
    };
}

module.exports = { getOpsSnapshot };