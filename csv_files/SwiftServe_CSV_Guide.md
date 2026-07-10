# SwiftServe Operations - CSV Dataset Guide
## For Viyug.AI Intern Assignment

---

## Overview
Candidates will receive the following CSV files as part of the **SwiftServe Operations Operations & Intelligence Platform** take-home assignment. These files mirror real-world field service operations data structures .

---

## CSV Files Included

### 1. **swiftserve_technicians.csv**
**Purpose:** Field technician roster and performance metrics

| Column | Description |
|--------|-------------|
| `technician_id` | Unique identifier (TECH001-TECH008) |
| `name` | Technician full name |
| `location` | Primary deployment location (city) |
| `status` | Active/Inactive status |
| `skills` | Comma-separated capabilities (Installation, Repairs, etc.) |
| `total_assignments` | Career total work orders assigned |
| `completed_assignments` | Successfully completed work orders |
| `avg_response_time_hours` | Average time from dispatch to arrival |

**Use Case:** Build technician availability dashboards, skill-based allocation algorithms, performance rankings.

---

### 2. **swiftserve_work_orders.csv**
**Purpose:** Field service requests and job tracking

| Column | Description |
|--------|-------------|
| `work_order_id` | Unique job ID (WO001-WO010) |
| `customer_name` | Client organization name |
| `location` | Site/facility location |
| `issue_type` | Problem category (Equipment Failure, Maintenance, Installation, etc.) |
| `priority` | Criticality level (Low, Medium, High, Critical) |
| `status` | Job state (Completed, In Progress, On Hold) |
| `assigned_technician` | Assigned tech ID (TECH001-TECH008) |
| `created_date` | When request was logged |
| `due_date` | Target completion date |
| `completed_date` | Actual completion date (NULL if pending) |
| `resolution_time_hours` | Hours from dispatch to resolution |
| `estimated_cost_inr` | Budget estimate in Indian Rupees |

**Use Case:** Build request-to-resolution pipelines, SLA compliance tracking, bottleneck identification (which jobs are overdue, understaffed, etc.).

---

### 3. **swiftserve_equipment.csv**
**Purpose:** Asset inventory and health status

| Column | Description |
|--------|-------------|
| `equipment_id` | Asset identifier (EQ001-EQ008) |
| `customer_id` | Associated customer (CUST001-CUST008) |
| `equipment_name` | Asset name (PowerSystem A1, etc.) |
| `equipment_type` | Category (Power Supply, Server, Network Device, etc.) |
| `status` | Operational state (Active, Degraded, Inactive) |
| `location` | Physical location |
| `install_date` | When equipment was deployed |
| `last_maintenance` | Most recent service date |
| `next_maintenance_due` | Scheduled maintenance window |
| `uptime_percent` | Historical availability % (e.g., 99.2%) |
| `critical_alerts` | Count of unresolved critical issues |

**Use Case:** Predictive maintenance dashboards, preventive scheduling, risk scoring for equipment near maintenance windows.

---

### 4. **swiftserve_sla_metrics.csv**
**Purpose:** Service Level Agreement compliance and customer commitments

| Column | Description |
|--------|-------------|
| `metric_id` | SLA record ID |
| `customer_id` | Customer identifier (CUST001-CUST008) |
| `customer_name` | Full customer name |
| `sla_tier` | Service level (Basic, Standard, Premium, Enterprise) |
| `response_time_target_hours` | Contractual response commitment |
| `resolution_time_target_hours` | Contractual fix commitment |
| `monthly_uptime_target_percent` | Availability guarantee (e.g., 99.5%) |
| `avg_response_time_actual` | Actual response performance this month |
| `avg_resolution_time_actual` | Actual resolution performance this month |
| `actual_uptime_percent` | Actual uptime achieved |
| `sla_breaches_this_month` | Count of SLA violations |
| `sla_compliance_percent` | Compliance score (e.g., 95%) |

**Use Case:** Executive dashboards, risk alerts (customers with < 90% compliance), contractual reporting, escalation triggers.

---

### 5. **swiftserve_dispatch_logs.csv**
**Purpose:** Real-time field activity and execution tracking

| Column | Description |
|--------|-------------|
| `dispatch_id` | Unique dispatch record ID |
| `work_order_id` | Associated work order |
| `technician_id` | Assigned technician |
| `dispatch_time` | When technician was alerted |
| `arrival_time` | When tech reached customer site |
| `departure_time` | When tech left the site |
| `status` | Execution state (Completed, In Progress, On Hold) |
| `notes` | Field notes / issue summary |
| `customer_feedback_rating` | Post-job satisfaction (1-5 stars) |

**Use Case:** Real-time operational control tower, MTTR (Mean Time to Repair) calculation, quality assurance scoring, field activity audit logs.

---

## Assignment Implementation Guide

### Candidate's Deliverables
Candidates should build a **SwiftServe Operations Intelligence Dashboard** that:

1. **ACT Mode** (Reactive - Address Immediate Issues)
   - Flag overdue work orders (past due_date)
   - Identify SLA breaches (compliance < 95%)
   - Show critical equipment alerts (critical_alerts > 2)
   - Suggest next dispatcher action (who to call, what to escalate)

2. **OBSERVE Mode** (Historical Analysis)
   - Technician performance rankings (completion rate, avg response time)
   - Customer health snapshots (uptime, breach history)
   - Equipment status by criticality
   - Work order cycle time trends

3. **EXPLORE Mode** (Strategic Intelligence)
   - Resource allocation optimization (which technician for which job type?)
   - Preventive maintenance recommendations (equipment nearing due date)
   - Customer risk scoring (who's at risk of churn?)
   - Bottleneck analysis (what's slowing down resolution?)

### Technical Approach
- **Input:** Ingest all 5 CSV files
- **Processing:** Join/aggregate data across tables
- **Output:** Dashboard views in ACT/OBSERVE/EXPLORE modes
- **Submission:** GitHub repo + 3-min Loom walkthrough

---

## Data Characteristics (Realistic Patterns)

✅ **Response Time Reality**
- Premium SLAs: 2-hour targets → actual 2-3 hours
- Standard SLAs: 4-hour targets → actual 3-5 hours
- Enterprise: 1-hour targets → actual 1.5-2.5 hours (with 0% breach)

✅ **SLA Compliance Variance**
- Best customer (LMN Retail): 100% compliance, 1.5h avg response
- Problematic customer (DEF Hospitals): 72% compliance, needs intervention
- Most customers: 95-100% compliance

✅ **Technician Utilization**
- High performers (TECH001, TECH006): 22-24 assignments, 95%+ completion
- Average performers: 15-20 assignments, 90-95% completion
- Inactive: Can't assign new work (TECH005 - Inactive)

✅ **Work Order Mix**
- 60% routine maintenance (Medium/Low priority)
- 30% repairs/diagnostics (High priority)
- 10% critical emergency (Critical priority) → must respond in <2 hours

---

## Integration with Viyug.AI Platform

This assignment mirrors the **real Wind O&M operations** structure:
- **Technicians** ↔ Field service teams
- **Work Orders** ↔ Maintenance requests / asset failures
- **Equipment** ↔ Wind turbines / SCADA systems
- **SLA Metrics** ↔ Contractual uptime guarantees
- **Dispatch Logs** ↔ Real-time operational logs

By solving this assignment, candidates demonstrate they understand:
- Multi-tenant field service architectures
- Human-in-the-loop decision-making
- Event-driven operational control towers
- Agentic AI coordination in physical operations

---

## Support for Candidates

📧 **Questions During Implementation?**
- Send query to: `business@viyug.ai`
- Reference: Assignment ID + specific CSV field
- Expected response: Within 24 hours

📊 **Data Validation Tips**
- Check for NULL values in date fields (indicates pending/on-hold jobs)
- Verify date sequences (arrival_time > dispatch_time)
- Cross-reference work_order_id across tables (should exist in dispatch_logs)
- Validate status consistency (Completed WOs should have completed_date)

---

**Assignment Version:** 1.0  
**Last Updated:** November 2024  
**Prepared For:** Viyug.AI Intern Program
