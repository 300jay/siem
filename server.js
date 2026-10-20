const express = require("express");
const { MongoClient } = require("mongodb");

const app = express();
app.use(express.json());

// Allow React dev server to call this API
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    next();
});

// ---------------------------------------------------------------------------
// MongoDB connection
// ---------------------------------------------------------------------------
const MONGO_URI = process.env.SIEM_MONGO_URI || "mongodb://localhost:27017/";
const DB_NAME   = "siem_db";

let db;

async function connectMongo() {
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`[mongo] Connected to ${MONGO_URI} -> ${DB_NAME}`);
}

// ---------------------------------------------------------------------------
// Shared query helpers
// ---------------------------------------------------------------------------

/**
 * Parse common query params shared by every list endpoint:
 *   ?limit=50&skip=0&from=<ISO>&to=<ISO>&severity=high
 */
function parseParams(query) {
    const limit    = Math.min(parseInt(query.limit  || "50",  10), 500);
    const skip     = parseInt(query.skip   || "0",  10);
    const filter   = {};

    if (query.from || query.to) {
        filter.timestamp = {};
        if (query.from) filter.timestamp.$gte = query.from;
        if (query.to)   filter.timestamp.$lte = query.to;
    }
    if (query.severity) filter.severity = query.severity;
    if (query.rule_id)  filter.rule_id  = query.rule_id;
    if (query.pid)      filter.pid      = parseInt(query.pid, 10);
    if (query.host)     filter.host     = query.host;

    return { limit, skip, filter };
}

async function listDocs(collection, query, extraFilter = {}) {
    const { limit, skip, filter } = parseParams(query);
    const merged = { ...filter, ...extraFilter };
    const docs = await db.collection(collection)
        .find(merged, { projection: { _id: 0 } })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
    const total = await db.collection(collection).countDocuments(merged);
    return { total, skip, limit, results: docs };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

// GET /api/alerts  — list alerts (paginated, filterable)
app.get("/api/alerts", async (req, res) => {
    try {
        res.json(await listDocs("alerts", req.query));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/alerts/stats  — count by severity
app.get("/api/alerts/stats", async (req, res) => {
    try {
        const pipeline = [
            { $group: { _id: "$severity", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ];
        const rows = await db.collection("alerts").aggregate(pipeline).toArray();
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// Process events
// ---------------------------------------------------------------------------

// GET /api/events/process
app.get("/api/events/process", async (req, res) => {
    try {
        const extra = {};
        if (req.query.image) extra.image = { $regex: req.query.image, $options: "i" };
        res.json(await listDocs("events_process", req.query, extra));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// Network events
// ---------------------------------------------------------------------------

// GET /api/events/network
app.get("/api/events/network", async (req, res) => {
    try {
        const extra = {};
        if (req.query.dst_ip)   extra.dst_ip   = req.query.dst_ip;
        if (req.query.protocol) extra.protocol = req.query.protocol;
        res.json(await listDocs("events_network", req.query, extra));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ---------------------------------------------------------------------------
// DNS events
// ---------------------------------------------------------------------------

// GET /api/events/dns
app.get("/api/events/dns", async (req, res) => {
    try {
        const extra = {};
        if (req.query.query) extra.dns_query = { $regex: req.query.query, $options: "i" };
        res.json(await listDocs("events_dns", req.query, extra));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// ---------------------------------------------------------------------------
// Traffic Intelligence
// ---------------------------------------------------------------------------

// GET /api/traffic-intelligence?limit=100
app.get("/api/traffic-intelligence", async (req, res) => {
    try {
        const collection = db.collection("events_network");

        const requestedLimit = parseInt(req.query.limit || "100", 10);
        const limit = Math.min(
            Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1),
            200
        );

        const [
            totalConnections,
            protocols,
            topSources,
            topDestinations,
            events
        ] = await Promise.all([
            collection.countDocuments(),

            collection.aggregate([
                {
                    $group: {
                        _id: { $ifNull: ["$protocol", "Unknown"] },
                        connections: { $sum: 1 }
                    }
                },
                { $sort: { connections: -1 } },
                { $limit: 10 }
            ]).toArray(),

            collection.aggregate([
                { $match: { src_ip: { $exists: true, $ne: null } } },
                {
                    $group: {
                        _id: "$src_ip",
                        connections: { $sum: 1 }
                    }
                },
                { $sort: { connections: -1 } },
                { $limit: 10 }
            ]).toArray(),

            collection.aggregate([
                { $match: { dst_ip: { $exists: true, $ne: null } } },
                {
                    $group: {
                        _id: "$dst_ip",
                        connections: { $sum: 1 }
                    }
                },
                { $sort: { connections: -1 } },
                { $limit: 10 }
            ]).toArray(),

            collection.find(
                {},
                { projection: { _id: 0 } }
            )
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray()
        ]);

        res.json({
            totalConnections,
            protocols: protocols.map(item => ({
                protocol: String(item._id),
                connections: item.connections
            })),
            topSources: topSources.map(item => ({
                ip: String(item._id),
                connections: item.connections
            })),
            topDestinations: topDestinations.map(item => ({
                ip: String(item._id),
                connections: item.connections
            })),
            events
        });

    } catch (error) {
        console.error("[traffic-intelligence] Error:", error.message);
        res.status(500).json({
            error: "Failed to load traffic intelligence"
        });
    }
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", async (req, res) => {
    try {
        await db.command({ ping: 1 });
        res.json({ status: "ok", db: DB_NAME });
    } catch (e) {
        res.status(503).json({ status: "error", error: e.message });
    }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
connectMongo()
    .then(() => {
        app.listen(3000, () => {
            console.log("SIEM API listening on http://localhost:3000");
            console.log("  GET /api/alerts");
            console.log("  GET /api/alerts/stats");
            console.log("  GET /api/events/process");
            console.log("  GET /api/events/network");
            console.log("  GET /api/events/dns");
            console.log("  GET /api/traffic-intelligence");
            console.log("  GET /health");
        });
    })
    .catch(err => {
        console.error("[mongo] Connection failed:", err.message);
        process.exit(1);
    });