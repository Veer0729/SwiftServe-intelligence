const fs = require("fs");
const path = require("path"); // manages reading and writing part
const crypto = require("crypto"); // create secure digital fingerprints
const { Groq } = require("groq-sdk");
const { getOpsSnapshot } = require("./db/queries"); // brings our db report
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const CACHE_FILE_PATH = path.join(__dirname, "cache.json");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// thse two functions are short term memory, the system saves the AI's last answer so we dont call the api again
function readPersistentCache() {
  if (!fs.existsSync(CACHE_FILE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE_PATH, "utf8"));
  } catch (error) {
    return {};
  }
}

function writePersistentCache(cacheData) {
  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2), "utf8");
  } catch (error) {
    console.error("⚠️ [CACHE ERROR] Failed writing persistent file store:", error);
  }
}

// our mmain function, this takes the exact db snapshot and if database hasn't changed since the last time
// the fingerprint will be identical. If even a single work order is updated, the fingerprint changes completely, 
// signaling the app that it needs a fresh AI summary.
function generateHash(snapshot) {
  if (!snapshot || !snapshot.act_metrics) {
    return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  }

  const stableMetrics = {
    unresolved_high_priority_orders: snapshot.act_metrics.unresolved_high_priority_orders || [],
    critical_equipment_alerts: snapshot.act_metrics.critical_equipment_alerts || [],
    active_technician_performance: snapshot.observe_metrics?.active_technician_performance || [],
    sla_violations: snapshot.act_metrics.sla_violations || [],
    zone_breach_alerts: snapshot.escalation_alerts?.zone_breach_alerts || [],
    overdue_high_cost_work_orders: snapshot.escalation_alerts?.overdue_high_cost_work_orders || []
  };
  
  const sortedMetricString = JSON.stringify(stableMetrics, Object.keys(stableMetrics).sort());
  return crypto.createHash("sha256").update(sortedMetricString).digest("hex");
}


// our halucinating guradrail, it has all the real Work Order and Equipment IDs directly from the database snapshot
// so if the ai mentions some other ID this function throws it into trash
function runCitationGuard(brief, snapshot) {
  if (!snapshot || !snapshot.act_metrics) return brief;

  const validWorkOrderIds = new Set(
    (snapshot.act_metrics.unresolved_high_priority_orders || []).map((o) => o.id)
  );
  const validEquipmentIds = new Set(
    (snapshot.act_metrics.critical_equipment_alerts || []).map((e) => e.id)
  );

  const filterValidItems = (items, validSet, label) => {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      if (item.related_id === null || item.related_id === undefined || item.related_id === "") {
        return true; 
      }

      if (!validSet.has(item.related_id)) {
        console.warn(
          `[GUARDRAIL BAILOUT] Stripped unverified reference to ${label} ID: "${item.related_id}"`
        );
        return false;
      }
      return true;
    });
  };

  brief.critical = filterValidItems(
    brief.critical,
    validWorkOrderIds,
    "Work Order"
  );
  
  brief.attention = filterValidItems(
    brief.attention,
    validEquipmentIds,
    "Equipment"
  );

  return brief;
}

async function generateMorningBrief() {
  const snapshot = getOpsSnapshot(); // it gets the latest snapshot and creates a fingerprint

  const snapshotHash = generateHash(snapshot);

  const persistentCache = readPersistentCache();

  if (persistentCache[snapshotHash]) { // chcks if already cached
    console.log(
      "[CACHE PASS] Stable data fingerprint matched from disk cache. Returning cached brief instantly."
    );
    return persistentCache[snapshotHash];
  }

  console.log("[CACHE MISS] New snapshot data detected. Calling Groq...");

  const prompt = `
You are an operations intelligence assistant for SwiftServe. Analyze this frozen data snapshot and write a morning executive brief.

Terminology Context:
- "WO" stands strictly for Work Order.
- "EQ" stands strictly for Equipment.
- "TECH" stands strictly for Field Technician.
- "SLA" stands strictly for Service Level Agreement.

Snapshot Data:
${JSON.stringify(snapshot, null, 2)}

You must respond using EXACTLY this JSON structure. Make absolutely sure every single property value is enclosed in correct, matching double quotation marks.

CRITICAL RULE: Create a SEPARATE object entry for EACH individual entity. NEVER combine multiple IDs or multiple names into a single object summary.

{
  "critical": [
    {
      "summary": "Short text detailing ONE specific urgent unresolved high priority work order (WO) OR critical zone escalation.",
      "related_id": "The single exact Work Order ID string (e.g., 'WO003'). Never put Equipment (EQ) IDs here."
    }
  ],
  "attention": [
    {
      "summary": "Short text detailing ONE specific equipment alert (EQ), ONE specific SLA breach risk, OR ONE specific overdue high-cost work order escalation threshold.",
      "related_id": "The single exact Equipment ID string (e.g., 'EQ003'). Never put Work Order (WO) IDs here. For SLA or high-cost work order escalations, use null."
    }
  ],
  "on_track": [
    {
      "summary": "Short text summarizing ONE specific high-performing technician's rate.",
      "related_id": "The single exact ID string of that specific technician (e.g., 'TECH001')."
    }
  ]
}

CRITICAL INSTRUCTIONS:
1. JSON VALIDATION: Ensure all fields inside the JSON arrays are properly quoted string literals. Never omit the opening or closing double quotes.
2. NO BUNDLING: If there are 7 active technicians, you must output 7 distinct objects inside the "on_track" array.
3. NO COMMA-SEPARATED IDS: Every "related_id" must contain exactly ONE ID string matching the snapshot data perfectly, or null if the item does not have a specific WO, EQ, or TECH id.
4. NO HALLUCINATIONS: Do not invent phrases or guess abbreviations. Rely strictly on the names and values inside the snapshot arrays.
5. EMPTY ARRAYS: If a category has no items in the snapshot, return an empty array [] for that section.
`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
    });

    let morningBrief = JSON.parse(chatCompletion.choices[0].message.content);

    morningBrief = runCitationGuard(morningBrief, snapshot);

    persistentCache[snapshotHash] = morningBrief;
    writePersistentCache(persistentCache);

    return morningBrief;
  } catch (error) {
    console.error("Pipeline error:", error);
    return {
      ai_unavailable: true,
      critical: [
        {
          summary: "Pipeline connection error or invalid API key environment. Manual check required.",
          related_id: null,
        },
      ],
      attention: [],
      on_track: [],
    };
  }
}

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.get("/api/snapshot", (req, res) => {
  try {
    const snapshot = getOpsSnapshot();
    const hash = generateHash(snapshot);
    res.json({ success: true, hash, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/brief", async (req, res) => {
  try {
    const startTime = Date.now();
    const snapshot = getOpsSnapshot();
    const hash = generateHash(snapshot);

    const brief = await generateMorningBrief();
    const durationMs = Date.now() - startTime;

    let wasCached = false;
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, "utf8"));
      if (cacheData[hash]) wasCached = true;
    }

    res.json({
      success: true,
      hash,
      cached: wasCached && !brief.ai_unavailable,
      ai_unavailable: !!brief.ai_unavailable,
      latency_ms: durationMs,
      data: brief
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/cache/clear", (req, res) => {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      fs.unlinkSync(CACHE_FILE_PATH);
      return res.json({ success: true, message: "Persistent disk cache cleared!" });
    }
    res.json({ success: true, message: "Cache was already empty." });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 UI Server active! Keep this terminal running.`);
  console.log(`🔗 API Server: http://localhost:${PORT}`);
  console.log(`👉 Open your index.html file in your browser to view the UI!`);
});