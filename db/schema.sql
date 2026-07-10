
CREATE TABLE customers (
  id TEXT PRIMARY KEY,              
  name TEXT NOT NULL
);

CREATE TABLE technicians (
  id TEXT PRIMARY KEY,              
  name TEXT NOT NULL,
  location TEXT,
  status TEXT CHECK (status IN ('Active','Inactive')),
  skills TEXT,               
  total_assignments INTEGER,
  completed_assignments INTEGER,
  avg_response_time_hours REAL
);

CREATE TABLE work_orders (
  id TEXT PRIMARY KEY,              
  customer_name TEXT NOT NULL,      
  location TEXT,
  issue_type TEXT,
  priority TEXT CHECK (priority IN ('Low','Medium','High','Critical')),
  status TEXT CHECK (status IN ('Completed','In Progress','On Hold','Escalated')),
  assigned_technician TEXT REFERENCES technicians(id),
  created_date TEXT,
  due_date TEXT,
  completed_date TEXT,
  resolution_time_hours REAL,
  estimated_cost_inr REAL
);

CREATE TABLE equipment (
  id TEXT PRIMARY KEY,              
  customer_id TEXT REFERENCES customers(id),
  equipment_name TEXT,
  equipment_type TEXT,
  status TEXT CHECK (status IN ('Active','Degraded','Inactive')),
  location TEXT,
  install_date TEXT,
  last_maintenance TEXT,
  next_maintenance_due TEXT,
  uptime_percent REAL,
  critical_alerts INTEGER
);

CREATE TABLE sla_metrics (
  id TEXT PRIMARY KEY,           
  customer_id TEXT REFERENCES customers(id),
  customer_name TEXT,
  sla_tier TEXT CHECK (sla_tier IN ('Basic','Standard','Premium','Enterprise')),
  response_time_target_hours REAL,
  resolution_time_target_hours REAL,
  monthly_uptime_target_percent REAL,
  avg_response_time_actual REAL,
  avg_resolution_time_actual REAL,
  actual_uptime_percent REAL,
  sla_breaches_this_month INTEGER,
  sla_compliance_percent REAL
);

CREATE TABLE dispatch_logs (
  id TEXT PRIMARY KEY,              
  work_order_id TEXT REFERENCES work_orders(id),
  technician_id TEXT REFERENCES technicians(id),
  dispatch_time TEXT,
  arrival_time TEXT,
  departure_time TEXT,
  status TEXT,
  notes TEXT,
  customer_feedback_rating INTEGER
);