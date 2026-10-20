/* ============================================================================
 * mock-data.js  --  ALL THE FAKE DATA LIVES HERE. NOWHERE ELSE.
 * ============================================================================
 *
 * FOR WHOEVER IS BUILDING THE BACKEND:
 *
 * This is the ONLY file with made-up numbers in it. Every page in the
 * dashboard eventually reads from one of the functions below.
 *
 * To connect a real database, you do NOT need to touch the frontend at all.
 * You only change the functions in `api/routes.js` so they query your
 * database instead of calling these functions.
 *
 * Each function below has a comment showing the exact shape of the object
 * it returns. Your real database query must return that same shape, and
 * everything on screen will keep working.
 *
 * ========================================================================= */

// Small helper so the fake numbers look a bit different on each reload.
// Delete this once real data is wired in.
function jitter(base, percent = 8) {
  const swing = base * (percent / 100);
  return Math.round(base + (Math.random() * swing * 2 - swing));
}

/* ----------------------------------------------------------------------------
 * 1. OVERVIEW METRICS  (shown on the Dashboard page as the six cards)
 *
 * SHAPE: { cards: [ { id, label, value, note, tone } ] }
 *   tone decides the colour: "orange" | "purple" | "green" | "red" | "amber"
 * -------------------------------------------------------------------------- */
function getOverviewMetrics() {
  return {
    cards: [
      { id: 'total',      label: 'Total Connections',      value: jitter(9014),  note: 'across all hosts',      tone: 'orange' },
      { id: 'allowed',    label: 'Allowed Connections',    value: jitter(8903),  note: 'passed firewall rules', tone: 'green'  },
      { id: 'blocked',    label: 'Blocked Connections',    value: jitter(111),   note: 'denied by policy',      tone: 'red'    },
      { id: 'hosts',      label: 'Internal Hosts',         value: 42,            note: 'currently reporting',   tone: 'purple' },
      { id: 'suspicious', label: 'Suspicious Destinations',value: jitter(7),     note: 'flagged by threat feed',tone: 'amber'  },
      { id: 'alerts',     label: 'Active Critical Alerts', value: 3,             note: 'needs attention',       tone: 'red'    }
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 2. TRAFFIC OVER TIME  (the line chart on the Dashboard)
 *
 * SHAPE: { points: [ { label, value } ] }
 *   label = what shows under the chart (an hour here)
 *   value = the number plotted
 * -------------------------------------------------------------------------- */
function getTrafficSeries() {
  const points = [];
  for (let hour = 0; hour < 24; hour++) {
    // a believable daily curve: quiet at night, busy mid-afternoon
    const shape = Math.sin(((hour - 4) / 24) * Math.PI * 2) * 40 + 60;
    points.push({
      label: String(hour).padStart(2, '0') + ':00',
      value: Math.max(5, jitter(Math.round(shape * 12), 15))
    });
  }
  return { points };
}

/* ----------------------------------------------------------------------------
 * 3. CONNECTION STATUS SPLIT  (the two bars on the Dashboard)
 *
 * SHAPE: { rows: [ { label, value, total, tone } ] }
 * -------------------------------------------------------------------------- */
function getConnectionStatus() {
  const active = jitter(8903);
  const closed = jitter(111);
  const total = active + closed;
  return {
    rows: [
      { label: 'Active Connections', value: active, total, tone: 'green' },
      { label: 'Closed Connections', value: closed, total, tone: 'purple' }
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 4. PROTOCOLS  (Network Analytics page)
 *
 * SHAPE: { rows: [ { protocol, connections, bytes, share } ] }
 *   share is a percentage number, e.g. 48.2
 * -------------------------------------------------------------------------- */
function getProtocols() {
  const raw = [
    { protocol: 'HTTPS', connections: 5120, bytes: 8_340_000_000 },
    { protocol: 'TCP',   connections: 1880, bytes: 2_110_000_000 },
    { protocol: 'DNS',   connections: 1120, bytes:    48_000_000 },
    { protocol: 'HTTP',  connections:  540, bytes:   620_000_000 },
    { protocol: 'UDP',   connections:  260, bytes:   190_000_000 },
    { protocol: 'SSH',   connections:   74, bytes:    31_000_000 },
    { protocol: 'ICMP',  connections:   20, bytes:       900_000 }
  ];
  const totalConnections = raw.reduce((sum, r) => sum + r.connections, 0);
  return {
    rows: raw.map(r => ({
      ...r,
      share: Math.round((r.connections / totalConnections) * 1000) / 10
    }))
  };
}

/* ----------------------------------------------------------------------------
 * 5. NETWORK PERFORMANCE  (Network Analytics page)
 *
 * SHAPE: { stats: [ { label, value, unit, status } ] }
 *   status = "good" | "warn" | "bad"  (decides the colour dot)
 * -------------------------------------------------------------------------- */
function getPerformance() {
  return {
    stats: [
      { label: 'Average Latency', value: jitter(24),  unit: 'ms',   status: 'good' },
      { label: 'Packet Loss',     value: 0.3,         unit: '%',    status: 'good' },
      { label: 'Throughput',      value: jitter(842), unit: 'Mbps', status: 'good' },
      { label: 'Jitter',          value: jitter(6),   unit: 'ms',   status: 'warn' }
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 6. TRAFFIC BY COUNTRY  (Traffic Intelligence page)
 *
 * SHAPE: { rows: [ { country, code, connections, bytes } ] }
 * -------------------------------------------------------------------------- */
function getGeoTraffic() {
  return {
    rows: [
      { country: 'United States',        code: 'US', connections: 3120, bytes: 4_200_000_000 },
      { country: 'Germany',              code: 'DE', connections: 1480, bytes: 1_900_000_000 },
      { country: 'India',                code: 'IN', connections: 1210, bytes: 1_450_000_000 },
      { country: 'United Arab Emirates', code: 'AE', connections:  870, bytes:   980_000_000 },
      { country: 'Singapore',            code: 'SG', connections:  640, bytes:   720_000_000 },
      { country: 'United Kingdom',       code: 'GB', connections:  520, bytes:   610_000_000 },
      { country: 'Japan',                code: 'JP', connections:  410, bytes:   480_000_000 },
      { country: 'Netherlands',          code: 'NL', connections:  330, bytes:   390_000_000 },
      { country: 'Brazil',               code: 'BR', connections:  210, bytes:   240_000_000 },
      { country: 'Australia',            code: 'AU', connections:  160, bytes:   180_000_000 }
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 7. TRAFFIC DIRECTION  (Traffic Intelligence page)
 *
 * SHAPE: { rows: [ { label, value, tone } ] }  -- values should add to 100
 * -------------------------------------------------------------------------- */
function getTrafficDirection() {
  return {
    rows: [
      { label: 'Outbound', value: 58, tone: 'orange' },
      { label: 'Inbound',  value: 31, tone: 'purple' },
      { label: 'Lateral',  value: 11, tone: 'amber'  }
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 8. EGRESS BY ASN  (Traffic Intelligence page)
 *
 * SHAPE: { rows: [ { asn, name, bytes } ] }
 * -------------------------------------------------------------------------- */
function getAsnTraffic() {
  return {
    rows: [
      { asn: 'AS15169', name: 'Google LLC',           bytes: 2_400_000_000 },
      { asn: 'AS16509', name: 'Amazon AWS',           bytes: 1_900_000_000 },
      { asn: 'AS8075',  name: 'Microsoft Azure',      bytes: 1_350_000_000 },
      { asn: 'AS13335', name: 'Cloudflare',           bytes:   820_000_000 },
      { asn: 'AS32934', name: 'Meta Platforms',       bytes:   410_000_000 },
      { asn: 'AS14618', name: 'Amazon EC2 (us-east)', bytes:   260_000_000 }
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 9. CONNECTIONS TABLE  (Connections page)
 *
 * SHAPE: { rows: [ { sessionId, status, startTime, source, destination,
 *                    protocol, port, bytes, duration, severity } ] }
 *   status   = "active" | "closed"
 *   severity = "none" | "low" | "medium" | "high"
 * -------------------------------------------------------------------------- */
function getConnections() {
  const sources = ['192.168.1.6', '192.168.1.22', '10.0.4.18', '10.0.4.91', '172.16.2.7'];
  const destinations = [
    { ip: '45.113.192.3',  protocol: 'ICMP',  port: 8,   severity: 'high'   },
    { ip: '20.184.175.3',  protocol: 'TCP',   port: 443, severity: 'none'   },
    { ip: '149.82.112.21', protocol: 'HTTPS', port: 443, severity: 'none'   },
    { ip: '104.18.32.47',  protocol: 'HTTPS', port: 443, severity: 'none'   },
    { ip: '8.8.8.8',       protocol: 'DNS',   port: 53,  severity: 'none'   },
    { ip: '91.242.217.11', protocol: 'TCP',   port: 22,  severity: 'medium' },
    { ip: '13.107.42.14',  protocol: 'HTTPS', port: 443, severity: 'none'   },
    { ip: '185.63.253.2',  protocol: 'HTTP',  port: 80,  severity: 'low'    }
  ];

  const rows = [];
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const dest = destinations[i % destinations.length];
    const when = new Date(now - i * 47_000);
    rows.push({
      sessionId: 'SESS-' + (dest.severity === 'high' ? 'THREAT' : 'FLOW') +
                 '-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      status: i % 9 === 0 ? 'closed' : 'active',
      startTime: when.toISOString(),
      source: sources[i % sources.length],
      destination: dest.ip,
      protocol: dest.protocol,
      port: dest.port,
      bytes: Math.round(Math.random() * 900_000) + 78,
      duration: Math.round(Math.random() * 600) + 1,
      severity: dest.severity
    });
  }
  return { rows };
}

/* ----------------------------------------------------------------------------
 * 10. DNS ANALYTICS  (DNS Analytics page)
 *
 * SHAPE: { summary: {...}, rows: [ { domain, queries, type, verdict } ] }
 *   verdict = "clean" | "suspicious" | "blocked"
 * -------------------------------------------------------------------------- */
function getDnsAnalytics() {
  return {
    summary: {
      totalQueries: jitter(48_200),
      uniqueDomains: jitter(1_840),
      failedLookups: jitter(126),
      blockedDomains: 14
    },
    rows: [
      { domain: 'api.github.com',          queries: 4820, type: 'A',     verdict: 'clean'      },
      { domain: 'login.microsoftonline.com',queries: 3110, type: 'A',    verdict: 'clean'      },
      { domain: 'fonts.googleapis.com',    queries: 2740, type: 'A',     verdict: 'clean'      },
      { domain: 's3.amazonaws.com',        queries: 1990, type: 'CNAME', verdict: 'clean'      },
      { domain: 'telemetry.unknown-cdn.io',queries:  812, type: 'A',     verdict: 'suspicious' },
      { domain: 'update.windows.com',      queries:  640, type: 'A',     verdict: 'clean'      },
      { domain: 'xn--80ak6aa92e.com',      queries:  118, type: 'A',     verdict: 'blocked'    },
      { domain: 'pool.ntp.org',            queries:   96, type: 'A',     verdict: 'clean'      }
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 11. HTTP ANALYTICS  (HTTP Analytics page)
 *
 * SHAPE: { summary: {...}, statusCodes: [ { code, count, tone } ],
 *          rows: [ { path, method, requests, avgMs, status } ] }
 * -------------------------------------------------------------------------- */
function getHttpAnalytics() {
  return {
    summary: {
      totalRequests: jitter(126_400),
      avgResponseMs: jitter(182),
      errorRate: 1.4,
      largestPayloadMb: 14.2
    },
    statusCodes: [
      { code: '2xx Success',      count: 118_200, tone: 'green'  },
      { code: '3xx Redirect',     count:   5_100, tone: 'purple' },
      { code: '4xx Client Error', count:   2_340, tone: 'amber'  },
      { code: '5xx Server Error', count:     760, tone: 'red'    }
    ],
    rows: [
      { path: '/api/v1/orders',     method: 'GET',  requests: 24_100, avgMs: 142, status: 200 },
      { path: '/api/v1/inventory',  method: 'GET',  requests: 18_600, avgMs: 210, status: 200 },
      { path: '/api/v1/auth/token', method: 'POST', requests: 12_400, avgMs:  88, status: 200 },
      { path: '/api/v1/reports',    method: 'GET',  requests:  7_900, avgMs: 640, status: 200 },
      { path: '/api/v1/upload',     method: 'POST', requests:  3_200, avgMs: 980, status: 500 },
      { path: '/legacy/export.php', method: 'GET',  requests:    410, avgMs: 320, status: 404 }
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 12. PROCESS ANALYTICS  (Process Analytics page)
 *
 * SHAPE: { rows: [ { process, host, connections, bytes, cpu, risk } ] }
 *   risk = "low" | "medium" | "high"
 * -------------------------------------------------------------------------- */
function getProcessAnalytics() {
  return {
    rows: [
      { process: 'chrome.exe',   host: 'WS-0421', connections: 1840, bytes: 3_200_000_000, cpu: 14.2, risk: 'low'    },
      { process: 'node',         host: 'SRV-APP1',connections:  920, bytes: 1_800_000_000, cpu: 22.8, risk: 'low'    },
      { process: 'svchost.exe',  host: 'WS-0188', connections:  610, bytes:   240_000_000, cpu:  3.1, risk: 'low'    },
      { process: 'java',         host: 'SRV-DB2', connections:  480, bytes:   910_000_000, cpu: 31.5, risk: 'medium' },
      { process: 'python3',      host: 'SRV-ETL', connections:  260, bytes:   420_000_000, cpu: 18.0, risk: 'low'    },
      { process: 'unknown-bin',  host: 'WS-0377', connections:   42, bytes:    18_000_000, cpu:  0.8, risk: 'high'   }
    ]
  };
}

/* ----------------------------------------------------------------------------
 * 13. ALERTS  (Alerts page)
 *
 * SHAPE: { rows: [ { id, title, description, severity, source, time,
 *                    status } ] }
 *   severity = "critical" | "high" | "medium" | "low"
 *   status   = "open" | "acknowledged" | "resolved"
 * -------------------------------------------------------------------------- */
function getAlerts() {
  const now = Date.now();
  const mins = (n) => new Date(now - n * 60_000).toISOString();
  return {
    rows: [
      { id: 'ALR-1041', title: 'Repeated ICMP sweep from internal host',
        description: 'Host 192.168.1.6 sent ICMP echo requests to 212 external addresses in 4 minutes. This pattern usually means a port or host scan.',
        severity: 'critical', source: 'Flow Analyzer', time: mins(6),  status: 'open' },

      { id: 'ALR-1040', title: 'Connection to newly registered domain',
        description: 'Outbound HTTPS to telemetry.unknown-cdn.io, a domain first seen 3 days ago. Newly registered domains are often used for command and control.',
        severity: 'high', source: 'DNS Monitor', time: mins(23), status: 'open' },

      { id: 'ALR-1039', title: 'SSH from an unusual country',
        description: 'Inbound SSH session accepted from 91.242.217.11. No prior successful logins have come from this location.',
        severity: 'high', source: 'Geo Rules', time: mins(48), status: 'acknowledged' },

      { id: 'ALR-1038', title: 'Spike in 5xx server errors',
        description: 'The /api/v1/upload endpoint returned 760 server errors in the last hour, about 9 times the normal rate.',
        severity: 'medium', source: 'HTTP Monitor', time: mins(74), status: 'open' },

      { id: 'ALR-1037', title: 'Unrecognised process opening sockets',
        description: 'Process unknown-bin on WS-0377 opened 42 outbound connections. This binary is not on the approved software list.',
        severity: 'medium', source: 'Process Monitor', time: mins(119), status: 'acknowledged' },

      { id: 'ALR-1036', title: 'Certificate expiring in 7 days',
        description: 'The TLS certificate for internal-api.corp expires on the 21st. Renew it before it lapses.',
        severity: 'low', source: 'Asset Monitor', time: mins(240), status: 'resolved' },

      { id: 'ALR-1035', title: 'Blocked connection to known bad IP',
        description: 'Firewall denied an outbound connection to 185.63.253.2, which appears on the threat intelligence blocklist.',
        severity: 'low', source: 'Firewall', time: mins(310), status: 'resolved' }
    ]
  };
}

module.exports = {
  getOverviewMetrics,
  getTrafficSeries,
  getConnectionStatus,
  getProtocols,
  getPerformance,
  getGeoTraffic,
  getTrafficDirection,
  getAsnTraffic,
  getConnections,
  getDnsAnalytics,
  getHttpAnalytics,
  getProcessAnalytics,
  getAlerts
};
