const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Groq } = require("groq-sdk");
const { getOpsSnapshot } = require("./db/queries");
require("dotenv").config();

// Define a stable local disk path for the persistent cache file
const CACHE_FILE_PATH = path.join(__dirname, "cache.json");

// Initialize Groq SDK (Uses GROQ_API_KEY from your .env file)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/**
 * Reads the persistent cache from disk safely.
 */
function readPersistentCache() {
  if (!fs.existsSync(CACHE_FILE_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE_PATH, "utf8"));
  } catch (error) {
    return {}; // Fallback if file is corrupted, unreadable, or empty
  }
}

/**
 * Writes the updated cache payload back to disk.
 */
function writePersistentCache(cacheData) {
  try {
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cacheData, null, 2), "utf8");
  } catch (error) {
    console.error("⚠️ [CACHE ERROR] Failed writing persistent file store:", error);
  }
}

/**
 * Generates a stable fingerprint hash for the operational metrics.
 * Explicitly isolates target metrics and sorts keys deterministically to 
 * avoid false cache misses from changing object structures or metadata.
 */
function generateHash(snapshot) {
  if (!snapshot || !snapshot.act_metrics) {
    return crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  }

  // Isolate your metric arrays from dynamic runtime properties or rolling timestamps
  const stableMetrics = {
    unresolved_high_priority_orders: snapshot.act_metrics.unresolved_high_priority_orders || [],
    critical_equipment_alerts: snapshot.act_metrics.critical_equipment_alerts || [],
    active_technician_performance: snapshot.observe_metrics?.active_technician_performance || [],
    sla_violations: snapshot.act_metrics.sla_violations || [],
    zone_breach_alerts: snapshot.escalation_alerts?.zone_breach_alerts || [],
    overdue_high_cost_work_orders: snapshot.escalation_alerts?.overdue_high_cost_work_orders || []
  };
  
  // Deterministic JSON Stringification by forcing alphabetical property sort
  const sortedMetricString = JSON.stringify(stableMetrics, Object.keys(stableMetrics).sort());
  return crypto.createHash("sha256").update(sortedMetricString).digest("hex");
}

/**
 * Citation Guardrail: Cross-references generated IDs against live snapshot arrays.
 * Automatically strips out unverified/hallucinated references.
 */
/**
 * Citation Guardrail: Cross-references generated IDs against live snapshot arrays.
 * Automatically strips out unverified/hallucinated references while allowing
 * valid null values (for SLA breaches, cost escalations, etc.).
 */
function runCitationGuard(brief, snapshot) {
  if (!snapshot || !snapshot.act_metrics) return brief;

  // 1. Map ground truth IDs from DB snapshot
  const validWorkOrderIds = new Set(
    (snapshot.act_metrics.unresolved_high_priority_orders || []).map((o) => o.id)
  );
  const validEquipmentIds = new Set(
    (snapshot.act_metrics.critical_equipment_alerts || []).map((e) => e.id)
  );

  // 2. Safe verification helper
  const filterValidItems = (items, validSet, label) => {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      // Rule A: If related_id is null or empty, it's a structural metric (SLA/cost) -> Let it pass!
      if (item.related_id === null || item.related_id === undefined || item.related_id === "") {
        return true; 
      }

      // Rule B: Verify defined alphanumeric IDs (e.g. 'EQ003', 'WO009') against ground-truth sets
      if (!validSet.has(item.related_id)) {
        console.warn(
          `[GUARDRAIL BAILOUT] Stripped unverified reference to ${label} ID: "${item.related_id}"`
        );
        return false; // Drop hallucination
      }
      return true; // Keep verified entity
    });
  };

  // 3. Process each target array with its correct domain validation set
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
/**
 * Main Orchestrator Pipeline
 */
async function generateMorningBrief() {
  // 1. Fetch current database state
  const snapshot = getOpsSnapshot();

  // 2. Extract stable fingerprint hash
  const snapshotHash = generateHash(snapshot);

  // 3. Load persistent cache state from local disk storage
  const persistentCache = readPersistentCache();

  // 4. CACHE HIT: Bypass Groq entirely if stable fingerprint matched from disk
  if (persistentCache[snapshotHash]) {
    console.log(
      "[CACHE PASS] Stable data fingerprint matched from disk cache. Returning cached brief instantly."
    );
    return persistentCache[snapshotHash];
  }

  // 5. CACHE MISS: Run inference only when operational metrics fluctuate
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

    // 6. Clean output via structural verification
    morningBrief = runCitationGuard(morningBrief, snapshot);

    // 7. Commit output to disk-backed persistent cache using the stable fingerprint key
    persistentCache[snapshotHash] = morningBrief;
    writePersistentCache(persistentCache);

    return morningBrief;
  } catch (error) {
    console.error("Pipeline error:", error);
    return {
      ai_unavailable: true, // <-- explicit flag, never set on a real Groq response
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

// System script verification block
// ==========================================
// INTEGRATED EXPRESS SERVER FOR THE DEMO
// ==========================================
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3001;

// Enable JSON parsing and CORS (so index.html can talk to this server)
app.use(cors());
app.use(express.json());

// 1. Get raw database metrics
app.get("/api/snapshot", (req, res) => {
  try {
    const snapshot = getOpsSnapshot(); // Calls your project's query function
    const hash = generateHash(snapshot);
    res.json({ success: true, hash, data: snapshot });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Get the generated and cache-validated Morning Brief
app.get("/api/brief", async (req, res) => {
  try {
    const startTime = Date.now();
    const snapshot = getOpsSnapshot();
    const hash = generateHash(snapshot);

    // Run the generation pipeline (your existing function)
    const brief = await generateMorningBrief();
    const durationMs = Date.now() - startTime;

    // Check if it was read from cache by verifying if the file exists and matches the hash
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

// 3. Clear cache route to force dynamic regeneration
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

// Start the server automatically
app.listen(PORT, () => {
  console.log(`\n🚀 UI Server active! Keep this terminal running.`);
  console.log(`🔗 API Server: http://localhost:${PORT}`);
  console.log(`👉 Open your index.html file in your browser to view the UI!`);
});