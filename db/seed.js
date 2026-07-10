const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'project.db');
const schemaPath = path.join(__dirname, 'schema.sql');
const csvFolder = path.join(__dirname, '..', 'csv_files');

// 1. Reset the database file for an idempotent run
if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
}

const db = new Database(dbPath);
console.log('Created fresh SQLite database.');

// 2. Execute schema.sql to build tables
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);
console.log('Tables created from schema.sql.');

// Helper to read and parse CSV files
const readCSV = (fileName) => {
    const filePath = path.join(csvFolder, fileName);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return parse(fileContent, { columns: true, skip_empty_lines: true });
};

// 3. Load all CSV data
console.log('Reading CSV files...');
const dispatchLogs = readCSV('swiftserve_dispatch_logs.csv');
const equipment = readCSV('swiftserve_equipment.csv');
const slaMetrics = readCSV('swiftserve_sla_metrics.csv');
const technicians = readCSV('swiftserve_technicians.csv');
const workOrders = readCSV('swiftserve_work_orders.csv');

// 4. Derive Customers (from equipment and sla_metrics)
console.log('Deriving customers table...');
const customersMap = new Map();

equipment.forEach(row => {
    if (row.customer_id && row.customer_name) {
        customersMap.set(row.customer_id, row.customer_name);
    }
});

slaMetrics.forEach(row => {
    if (row.customer_id && row.customer_name) {
        customersMap.set(row.customer_id, row.customer_name);
    }
});

const insertCustomer = db.prepare('INSERT INTO customers (id, name) VALUES (?, ?)');
db.transaction(() => {
    for (const [id, name] of customersMap.entries()) {
        insertCustomer.run(id, name);
    }
})();

// 5. Insert Technicians
console.log('Inserting technicians...');
const insertTechnician = db.prepare(`
    INSERT INTO technicians (id, name, location, status, skills, total_assignments, completed_assignments, avg_response_time_hours)
    VALUES (@id, @name, @location, @status, @skills, @total_assignments, @completed_assignments, @avg_response_time_hours)
`);
db.transaction(() => {
    for (const row of technicians) {
        insertTechnician.run({
            id: row.technician_id, // Map from technician_id to id
            name: row.name,
            location: row.location,
            status: row.status,
            skills: row.skills,
            total_assignments: row.total_assignments ? parseInt(row.total_assignments) : null,
            completed_assignments: row.completed_assignments ? parseInt(row.completed_assignments) : null,
            avg_response_time_hours: row.avg_response_time_hours ? parseFloat(row.avg_response_time_hours) : null
        });
    }
})();

// 6. Insert Work Orders
console.log('Inserting work orders...');
const insertWorkOrder = db.prepare(`
    INSERT INTO work_orders (id, customer_name, location, issue_type, priority, status, assigned_technician, created_date, due_date, completed_date, resolution_time_hours, estimated_cost_inr)
    VALUES (@id, @customer_name, @location, @issue_type, @priority, @status, @assigned_technician, @created_date, @due_date, @completed_date, @resolution_time_hours, @estimated_cost_inr)
`);
db.transaction(() => {
    for (const row of workOrders) {
        insertWorkOrder.run({
            id: row.work_order_id, // Map from work_order_id to id
            customer_name: row.customer_name,
            location: row.location,
            issue_type: row.issue_type,
            priority: row.priority,
            status: row.status,
            assigned_technician: row.assigned_technician || null,
            created_date: row.created_date,
            due_date: row.due_date,
            completed_date: row.completed_date || null,
            resolution_time_hours: row.resolution_time_hours ? parseFloat(row.resolution_time_hours) : null,
            estimated_cost_inr: row.estimated_cost_inr ? parseFloat(row.estimated_cost_inr) : null
        });
    }
})();

// 7. Insert Equipment
console.log('Inserting equipment...');
const insertEquipment = db.prepare(`
    INSERT INTO equipment (id, customer_id, equipment_name, equipment_type, status, location, install_date, last_maintenance, next_maintenance_due, uptime_percent, critical_alerts)
    VALUES (@id, @customer_id, @equipment_name, @equipment_type, @status, @location, @install_date, @last_maintenance, @next_maintenance_due, @uptime_percent, @critical_alerts)
`);
db.transaction(() => {
    for (const row of equipment) {
        insertEquipment.run({
            id: row.equipment_id, // Map from equipment_id to id
            customer_id: row.customer_id,
            equipment_name: row.equipment_name,
            equipment_type: row.equipment_type,
            status: row.status,
            location: row.location,
            install_date: row.install_date,
            last_maintenance: row.last_maintenance,
            next_maintenance_due: row.next_maintenance_due,
            uptime_percent: row.uptime_percent ? parseFloat(row.uptime_percent) : null,
            critical_alerts: row.critical_alerts ? parseInt(row.critical_alerts) : 0
        });
    }
})();

// 8. Insert SLA Metrics
console.log('Inserting SLA metrics...');
const insertSla = db.prepare(`
    INSERT INTO sla_metrics (id, customer_id, customer_name, sla_tier, response_time_target_hours, resolution_time_target_hours, monthly_uptime_target_percent, avg_response_time_actual, avg_resolution_time_actual, actual_uptime_percent, sla_breaches_this_month, sla_compliance_percent)
    VALUES (@id, @customer_id, @customer_name, @sla_tier, @response_time_target_hours, @resolution_time_target_hours, @monthly_uptime_target_percent, @avg_response_time_actual, @avg_resolution_time_actual, @actual_uptime_percent, @sla_breaches_this_month, @sla_compliance_percent)
`);
db.transaction(() => {
    for (const row of slaMetrics) {
        insertSla.run({
            id: row.metric_id, // Map from metric_id to id
            customer_id: row.customer_id,
            customer_name: row.customer_name,
            sla_tier: row.sla_tier,
            response_time_target_hours: row.response_time_target_hours ? parseFloat(row.response_time_target_hours) : null,
            resolution_time_target_hours: row.resolution_time_target_hours ? parseFloat(row.resolution_time_target_hours) : null,
            monthly_uptime_target_percent: row.monthly_uptime_target_percent ? parseFloat(row.monthly_uptime_target_percent) : null,
            avg_response_time_actual: row.avg_response_time_actual ? parseFloat(row.avg_response_time_actual) : null,
            avg_resolution_time_actual: row.avg_resolution_time_actual ? parseFloat(row.avg_resolution_time_actual) : null,
            actual_uptime_percent: row.actual_uptime_percent ? parseFloat(row.actual_uptime_percent) : null,
            sla_breaches_this_month: row.sla_breaches_this_month ? parseInt(row.sla_breaches_this_month) : 0,
            sla_compliance_percent: row.sla_compliance_percent ? parseFloat(row.sla_compliance_percent) : null
        });
    }
})();

// 9. Insert Dispatch Logs
console.log('Inserting dispatch logs...');
const insertDispatch = db.prepare(`
    INSERT INTO dispatch_logs (id, work_order_id, technician_id, dispatch_time, arrival_time, departure_time, status, notes, customer_feedback_rating)
    VALUES (@id, @work_order_id, @technician_id, @dispatch_time, @arrival_time, @departure_time, @status, @notes, @customer_feedback_rating)
`);
db.transaction(() => {
    for (const row of dispatchLogs) {
        insertDispatch.run({
            id: row.dispatch_id, // Map from dispatch_id to id
            work_order_id: row.work_order_id,
            technician_id: row.technician_id,
            dispatch_time: row.dispatch_time,
            arrival_time: row.arrival_time || null,
            departure_time: row.departure_time || null,
            status: row.status,
            notes: row.notes || null,
            customer_feedback_rating: row.customer_feedback_rating ? parseInt(row.customer_feedback_rating) : null
        });
    }
})();

console.log('Database seeding complete! All 5 tables populated successfully.');
db.close();