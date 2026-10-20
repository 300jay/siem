
const express = require('express');
const router = express.Router();
const mock = require('./mock-data');
const { MongoClient } = require('mongodb');

const BACKEND_URL =
    process.env.SIEM_BACKEND_URL || 'http://127.0.0.1:3000';

const MONGO_URL =
    process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';

const DB_NAME = 'siem_db';

let mongoClient;

async function getMongoDB() {
    if (!mongoClient) {
        mongoClient = new MongoClient(MONGO_URL);
        await mongoClient.connect();
    }

    return mongoClient.db(DB_NAME);
}

// Fetch data from the real backend.
async function backendGet(path) {
    const response = await fetch(`${BACKEND_URL}${path}`);

    if (!response.ok) {
        throw new Error(
            `Backend returned ${response.status} for ${path}`
        );
    }

    return response.json();
}

// Fetch every record, using pages of 500.

async function getAll(path) {
    const pageSize = 500;
    const all = [];
    let skip = 0;

    while (true) {
        const separator = path.includes('?') ? '&' : '?';

        const data = await backendGet(
            `${path}${separator}limit=${pageSize}&skip=${skip}`
        );

        const results = Array.isArray(data.results)
            ? data.results
            : [];

        all.push(...results);

        const total = Number(data.total ?? all.length);

        if (
            results.length === 0 ||
            all.length >= total ||
            results.length < pageSize
        ) {
            break;
        }

        skip += results.length;
    }

    return all;
}


function timestamp(value) {
    if (!value) return new Date().toISOString();

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? String(value)
        : date.toISOString();
}

function severity(value) {
    const normalized = String(value || '').toLowerCase();

    if (['critical', 'high', 'medium', 'low', 'info'].includes(normalized)) {
        return normalized;
    }

    return 'medium';
}

function paginate(rows, req) {
    const limit = Math.max(
        1,
        Math.min(Number(req.query.limit) || 100, 1000)
    );

    const offset = Math.max(Number(req.query.offset) || 0, 0);

    return {
        rows: rows.slice(offset, offset + limit),
        total: rows.length
    };
}

function getMock(path, req, res) {
    const handler = mock[path];

    if (typeof handler === 'function') {
        return handler(req, res);
    }

    return res.json({});
}

function safely(handler) {
    return async (req, res, next) => {
        try {
            await handler(req, res, next);
        } catch (error) {
            console.error('SIEM API error:', error.message);

            res.status(502).json({
                error: 'Unable to retrieve SIEM data',
                details: error.message
            });
        }
    };
}

// ----------------------------------------------------
// ALERTS
// ----------------------------------------------------

router.get('/alerts', safely(async (req, res) => {
    const data = await backendGet('/api/alerts?limit=1000');
    const sourceRows = data.results || data.rows || [];

    const rows = sourceRows.map(alert => ({
        id: alert.alert_id || alert.id,
        title: alert.title || alert.rule_id || 'Security alert',
        description: alert.details || alert.description || '',
        severity: severity(alert.severity),
        source: alert.host || alert.image || 'Unknown',
        time: timestamp(alert.timestamp),
        status: alert.status || 'open',
        attack: alert.attack || null,
        pid: alert.pid ?? null,
        eventUids: alert.event_uids || []
    }));

    const result = paginate(rows, req);

    res.json(result);
}));

router.get('/alerts/:id', safely(async (req, res) => {
    const data = await backendGet('/api/alerts?limit=1000');
    const alerts = data.results || data.rows || [];

    const alert = alerts.find(item =>
        String(item.alert_id || item.id) === String(req.params.id)
    );

    if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({
        id: alert.alert_id || alert.id,
        title: alert.title || alert.rule_id || 'Security alert',
        description: alert.details || '',
        severity: severity(alert.severity),
        source: alert.host || 'Unknown',
        time: timestamp(alert.timestamp),
        status: alert.status || 'open',
        attack: alert.attack || null
    });
}));

// Persist alert status changes in MongoDB.
router.patch('/alerts/:id', safely(async (req, res) => {
    const allowedStatuses = ['open', 'acknowledged', 'resolved'];
    const status = String(req.body.status || '').toLowerCase();

    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
            error: 'Invalid status',
            allowedStatuses
        });
    }

    const db = await getMongoDB();

    const result = await db.collection('alerts').updateOne(
        {
            $or: [
                { alert_id: req.params.id },
                { id: req.params.id }
            ]
        },
        {
            $set: {
                status,
                updated_at: new Date().toISOString()
            }
        }
    );

    if (result.matchedCount === 0) {
        return res.status(404).json({
            error: 'Alert not found in MongoDB'
        });
    }

    res.json({
        success: true,
        id: req.params.id,
        status
    });
}));

// ----------------------------------------------------
// NETWORK CONNECTIONS
// ----------------------------------------------------

router.get('/connections', safely(async (req, res) => {
    const events = await getAll('/api/events/network');

    const rows = events.map((event, index) => ({
        sessionId: event.event_uid || event.id || `network-${index}`,
        status: 'collected',
        startTime: timestamp(event.timestamp),
        source: event.src_ip || 'Unknown',
        destination: event.dst_ip || 'Unknown',
        protocol: String(event.protocol || 'Unknown').toUpperCase(),
        port: event.dst_port ?? event.src_port ?? null,
        bytes: Number(event.size || event.bytes || 0),
        duration: 0,
        severity: 'none',
        host: event.host || 'Unknown',
        pid: event.pid ?? null
    }));

    res.json(paginate(rows, req));
}));

// ----------------------------------------------------
// DNS ANALYTICS
// ----------------------------------------------------

router.get('/dns', safely(async (req, res) => {
    const events = await getAll('/api/events/dns');

    const domains = new Map();
    const failed = events.filter(event =>
        Number(event.query_status || 0) !== 0
    ).length;

    for (const event of events) {
        const domain = event.dns_query || 'Unknown';

        if (!domains.has(domain)) {
            domains.set(domain, {
                domain,
                queries: 0,
                type: event.query_type || 'Unknown',
                verdict: 'normal'
            });
        }

        const item = domains.get(domain);
        item.queries++;

        if (Number(event.query_status || 0) !== 0) {
            item.verdict = 'suspicious';
        }
    }

    const rows = [...domains.values()].sort(
        (a, b) => b.queries - a.queries
    );

    res.json({
        summary: {
            totalQueries: events.length,
            uniqueDomains: domains.size,
            failedLookups: failed,
            // Source data does not identify blocked domains.
            blockedDomains: 0
        },
        rows
    });
}));

// ----------------------------------------------------
// PROCESS ANALYTICS
// ----------------------------------------------------

router.get('/processes', safely(async (req, res) => {
    const events = await getAll('/api/events/process');
    const processes = new Map();

    for (const event of events) {
        const image = event.image || 'Unknown';
        const host = event.host || 'Unknown';
        const key = `${host}::${image}`;

        if (!processes.has(key)) {
            processes.set(key, {
                process: image,
                host,
                connections: 0,
                bytes: 0,
                cpu: null,
                risk: 'unknown'
            });
        }

        const item = processes.get(key);
        item.connections++;
        item.bytes += Number(event.size || event.bytes || 0);
    }

    const rows = [...processes.values()].sort(
        (a, b) => b.connections - a.connections
    );

    res.json(paginate(rows, req));
}));


/* ----------------------------------------------------
   TELEMETRY DASHBOARD.
---------------------------------------------------- */

function countBy(rows, getKey) {
    const counts = new Map();

    for (const row of rows) {
        const key = String(getKey(row) || 'Unknown').toUpperCase();
        counts.set(key, (counts.get(key) || 0) + 1);
    }

    return [...counts.entries()]
        .map(([key, count]) => ({
            key,
            count
        }))
        .sort((a, b) => b.count - a.count);
}

function validTimestamp(value) {
    if (!value) return null;

    const milliseconds = new Date(value).getTime();

    return Number.isFinite(milliseconds) ? milliseconds : null;
}

// Overview cards use counts from actual collected records.
router.get('/overview', safely(async (req, res) => {
    const [network, dns, processes, alertData] = await Promise.all([
        getAll('/api/events/network'),
        getAll('/api/events/dns'),
        getAll('/api/events/process'),
        backendGet('/api/alerts?limit=1000')
    ]);

    const alerts = alertData.results || alertData.rows || [];
    const hosts = new Set(
        [...network, ...dns, ...processes]
            .map(event => event.host)
            .filter(Boolean)
    );

    const cards = [
        {
            id: 'network',
            label: 'Collected Network Events',
            value: network.length,
            note: 'Recorded network telemetry',
            tone: 'orange'
        },
        {
            id: 'dns',
            label: 'DNS Events',
            value: dns.length,
            note: 'Recorded DNS telemetry',
            tone: 'purple'
        },
        {
            id: 'processes',
            label: 'Process Events',
            value: processes.length,
            note: 'Recorded process telemetry',
            tone: 'green'
        },
        {
            id: 'hosts',
            label: 'Observed Hosts',
            value: hosts.size,
            note: 'Distinct hosts in collected events',
            tone: 'purple'
        },
        {
            id: 'alerts',
            label: 'Recorded Alerts',
            value: alerts.length,
            note: 'Alerts returned by the backend',
            tone: 'red'
        },
        {
            id: 'open-alerts',
            label: 'Open Alerts',
            value: alerts.filter(alert =>
                !['resolved', 'closed'].includes(
                    String(alert.status || 'open').toLowerCase()
                )
            ).length,
            note: 'Not marked resolved or closed',
            tone: 'amber'
        }
    ];

    res.json({ cards });
}));

// Count actual events in hourly buckets across the most recent
// 24-hour period represented by the newest valid event timestamp.
router.get('/traffic-series', safely(async (req, res) => {
    const events = await getAll('/api/events/network');

    const timestamps = events
        .map(event => validTimestamp(event.timestamp))
        .filter(value => value !== null);

    if (timestamps.length === 0) {
        return res.json({ points: [] });
    }

    const latest = Math.max(...timestamps);
    const hourMs = 60 * 60 * 1000;
    const start = Math.floor(latest / hourMs) * hourMs - 23 * hourMs;
    const buckets = new Array(24).fill(0);

    for (const value of timestamps) {
        const index = Math.floor((value - start) / hourMs);

        if (index >= 0 && index < 24) {
            buckets[index]++;
        }
    }

    const points = buckets.map((value, index) => ({
        label: new Date(start + index * hourMs).toISOString().slice(11, 16),
        value
    }));

    res.json({ points });
}));


router.get('/connection-status', safely(async (req, res) => {
    const events = await getAll('/api/events/network');

    const latestTimestamp = events
        .map(event => validTimestamp(event.timestamp))
        .filter(value => value !== null)
        .reduce((latest, value) => Math.max(latest, value), 0);

    const uniqueHosts = new Set(
        events.map(event => event.host).filter(Boolean)
    ).size;

    res.json({
        title: 'Observed Network Telemetry',
        note: 'Connection active/closed state is not provided by the collected fields.',
        rows: [
            {
                label: 'Recorded Network Events',
                value: events.length,
                total: events.length,
                tone: 'green'
            },
            {
                label: 'Observed Hosts',
                value: uniqueHosts,
                total: uniqueHosts,
                tone: 'purple'
            }
        ],
        latestEvent: latestTimestamp
            ? new Date(latestTimestamp).toISOString()
            : null
    });
}));

// Protocol distribution from actual network event records.
router.get('/protocols', safely(async (req, res) => {
    const events = await getAll('/api/events/network');
    const counts = countBy(events, event => event.protocol);
    const total = events.length;

    const rows = counts.map(item => ({
        protocol: item.key,
        connections: item.count,
        share: total
            ? Math.round((item.count / total) * 1000) / 10
            : 0
    }));

    res.json({ rows });
}));

// These metrics are unavailable until the collector supplies
// the relevant real fields. Do not return fabricated values.
router.get('/performance', (req, res) => {
    res.json({
        available: false,
        message: 'Performance telemetry is not currently collected.',
        stats: []
    });
});

router.get('/geo', (req, res) => {
    res.json({
        available: false,
        message: 'Geographic data is not currently collected.',
        rows: []
    });
});

router.get('/direction', (req, res) => {
    res.json({
        available: false,
        message: 'Traffic direction cannot be established from the available event fields.',
        rows: []
    });
});

router.get('/asn', (req, res) => {
    res.json({
        available: false,
        message: 'ASN data is not currently collected.',
        rows: []
    });
});

module.exports = router;
