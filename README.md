# SwiftServe Intelligence — Operations Dashboard

A mini operations intelligence platform for SwiftServe's field service business: a live dashboard,
rule-based alerting, an AI-generated morning brief, and an automatic escalation engine — built on
the 5 provided CSVs.

---

## Running it

**Requirements:** Node.js (LTS), a free [Groq](https://console.groq.com) API key.

```bash
npm install
```

1. Place the 5 source CSVs in `csv_files/`:
   `swiftserve_technicians.csv`, `swiftserve_work_orders.csv`, `swiftserve_equipment.csv`,
   `swiftserve_sla_metrics.csv`, `swiftserve_dispatch_logs.csv`

2. Copy `.env.example` to `.env` and add your Groq key:
   ```
   GROQ_API_KEY=your_key_here
   ```

3. Build the database from the CSVs:
   ```bash
   node db/seed.js
   ```

4. Start the API server (auto-restarts on file changes):
   ```bash
   npx nodemon pipeline.js
   ```

5. Open `index.html` directly in a browser. It talks to the API at `http://localhost:3001`.

---

## Architecture

```
csv_files/*.csv
      │
      ▼
  db/seed.js  ──► project.db (SQLite)
                       │
                       ▼
              db/queries.js
        (pure SQL — alerts, KPIs,
         auto-escalation. No LLM here.)
                       │
                       ▼
               pipeline.js
     ┌─────────────────────────────┐
     │ 1. hash the snapshot        │
     │ 2. cache hit? → return it   │
     │ 3. cache miss? → call Groq  │
     │ 4. guardrail-check the      │
     │    model's output           │
     │ 5. cache + return           │
     └─────────────────────────────┘
                       │
                       ▼
     Express routes: /api/snapshot,
     /api/brief, /api/cache/clear
                       │
                       ▼
                 index.html
        (fetches both endpoints,
         renders the dashboard)
```

**Core discipline:** data flows one direction only. `queries.js` never calls the LLM, and
`pipeline.js` never queries the database directly — it only receives what `queries.js` already
computed. This means every number on the dashboard (KPIs, alerts, escalations) is deterministic
and correct even if the AI brief fails entirely, which is tested and handled explicitly (see
"Failure handling" below).

---

## Key design decisions

**Node/Express + SQLite**, chosen for zero setup time (no server process, no Docker) and no
network dependency during a live demo. The schema is standard relational, so migrating to Postgres
later would be a config change, not a rewrite.

**Denormalized `zone`/`location` on `work_orders`**, even though it's derivable through
`customer → sla_metrics`, because the zone-summary dashboard feature queries by location constantly
— this trades a small amount of normalization purity for a materially simpler/faster query path.

**Disk-cached, content-hashed AI brief.** The cache key is a SHA-256 hash of the *operational data*
(ticket counts, breaches, equipment alerts), not a timestamp. Two calls with identical underlying
state return the identical cached brief instead of re-calling Groq — cheaper, faster, and avoids
generating two slightly different briefs for the same situation.

**Citation guardrail.** After Groq returns a brief, every `related_id` it claims (e.g. `WO003`,
`EQ005`) is checked against the actual database IDs in the snapshot. Any unverified/hallucinated
reference is stripped before the brief is shown or cached — the model's claims are never trusted
outright.

**Deterministic rules produce every alert; the LLM only narrates them.** SLA breaches, equipment
alerts, and auto-escalation are all plain SQL logic in `db/queries.js`. Groq's only job is to turn
an already-computed JSON snapshot into readable prose — it never decides what counts as a breach.

**Graceful AI failure handling.** If the Groq call fails (bad key, network issue, rate limit), the
pipeline returns a flagged fallback (`ai_unavailable: true`) instead of crashing. The dashboard
shows an explicit "⚠ AI unavailable" badge, while KPIs, alerts, and the action queue — none of
which depend on the LLM — continue working normally. This was tested by temporarily invalidating
the API key.

---

## Data-honesty notes (read before the interview)

The provided CSVs don't fully match the original written brief. Rather than fabricate data to force
a fit, each gap was substituted with the closest honest equivalent, documented here and in code
comments at the point of use:

| Brief asked for | Source data has | What we did |
|---|---|---|
| A dedicated `clients.csv` | No such file — `customer_id`/`customer_name` scattered across `equipment.csv` and `sla_metrics.csv` | Derived a `customers` table in `db/seed.js` by scanning both files |
| `invoices.csv` with overdue billing data | **No invoice/billing data anywhere in the source** | Substituted **"At-Risk Work Order Value"**: the cost of work orders still open 45+ days past `due_date`, using `estimated_cost_inr` as a proxy. Labeled explicitly as a proxy everywhere it appears — never presented as real revenue |
| `inventory.csv` with stock/reorder levels | No inventory table — only `equipment.csv` with `critical_alerts` counts | Substituted **"Equipment Alerts"**: equipment rows with `critical_alerts > 2`. Labeled as equipment alerts, never as "stock" |
| 6 zones across 3 cities (Mumbai/Pune/Bangalore) | A single `location` string per row (e.g. "Mumbai Central," "Pune North") | Used `location` directly as the zone dimension |
| SLA rule: flat 8hr (critical) / 48hr (standard) | Per-customer tiers with pre-computed `sla_compliance_percent` in `sla_metrics.csv` | Alert threshold: `sla_compliance_percent < 95` or `sla_breaches_this_month > 0`, computed per customer rather than per ticket |

**Also worth knowing:** `work_orders.csv` has no `customer_id`, only `customer_name` as free text —
so any join between work orders and the derived `customers`/`sla_metrics` tables is a name match,
not a foreign key. This is a real data-quality limitation of the source files, not a bug in the
schema.

---

## File guide

| File | Responsibility |
|---|---|
| `db/schema.sql` | Table definitions, foreign keys, CHECK constraints |
| `db/seed.js` | One-time CSV → SQLite loader (destructive re-run: rebuilds `project.db` from scratch each time) |
| `db/queries.js` | All rule-based logic: KPIs, SLA/equipment alerts, auto-escalation. Zero AI. |
| `pipeline.js` | Caching, the Groq call, the citation guardrail, and the Express API server |
| `index.html` | Static dashboard frontend — fetches the API, renders KPIs / alerts / the AI brief |
| `nodemon.json` | Dev convenience: makes `nodemon` also watch `.env` for changes |

---

## Bonus deliverables included

- **Escalation simulation:** breached tickets are automatically moved to `Escalated` status on
  every snapshot fetch (`simulateEscalations()` in `db/queries.js`), and zones with 3+ escalated
  tickets trigger a dedicated Action Queue alert.
- **Overdue-value alerting** (adapted from the invoice requirement — see data-honesty notes above).
