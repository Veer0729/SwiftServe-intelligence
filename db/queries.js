const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'project.db');

function simulateEscalations(db) {

    const escalationResult = db.prepare(`
        UPDATE work_orders
        SET status = 'Escalated'
        WHERE status NOT IN ('Completed', 'Escalated') AND (
            (priority = 'Critical' AND resolution_time_hours > 8) OR
            (priority = 'High' AND resolution_time_hours > 48)
        )
    `).run();

    const criticalZones = db.prepare(`
        SELECT location as zone, COUNT(*) as breach_count 
        FROM work_orders 
        WHERE status = 'Escalated'
        GROUP BY location
        HAVING breach_count >= 3
    `).all();

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

    const escalations = simulateEscalations(db);

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

    const technicianPerformance = db.prepare(`
        SELECT id, name, status, 
               (CAST(completed_assignments AS REAL) / NULLIF(total_assignments, 0)) * 100 as completion_rate,
               avg_response_time_hours
        FROM technicians
        WHERE status = 'Active'
        ORDER BY completion_rate DESC
    `).all();

    
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

        at_risk_work_order_value_inr: atRiskValueRow.total,

        equipment_alerts_count: criticalAlerts.length
    };

    db.close();

    return {
        timestamp: new Date().toISOString(),
        kpis,
        act_metrics: {
            critical_equipment_alerts: criticalAlerts,
            sla_violations: slaBreaches,
            unresolved_high_priority_orders: urgentWorkOrders
        },
        escalation_alerts: {
            zone_breach_alerts: escalations.critical_zones,
            overdue_high_cost_work_orders: escalations.overdue_high_cost_work_orders,
            newly_escalated_this_run: escalations.escalated_count
        },
        observe_metrics: {
            active_technician_performance: technicianPerformance
        }
    };
}

module.exports = { getOpsSnapshot };