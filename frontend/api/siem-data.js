const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');

const files = {
  alerts: 'alerts.jsonl',
  network: 'etw_network_events.json',
  dns: 'etw_dns_events.json',
  processes: 'etw_process_events.json'
};

function readEvents(type) {
  const filename = files[type];

  if (!filename) {
    throw new Error(`Unknown event type: ${type}`);
  }

  const filepath = path.join(root, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`SIEM data file not found: ${filepath}`);
  }

  const content = fs.readFileSync(filepath, 'utf8').trim();

  if (!content) return [];

  // Support both JSON arrays and JSON Lines files.
  if (content.startsWith('[')) {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error(`${filename} must contain a JSON array`);
    }
    return parsed;
  }

  return content
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(
          `Invalid JSON in ${filename}, line ${index + 1}`
        );
      }
    });
}

function getAlerts() {
  return readEvents('alerts')
    .map((event, index) => ({
      id: String(event.alert_id || `alert-${index + 1}`),
      title: event.title || event.rule_id || 'SIEM Alert',
      description:
        event.details?.command_line ||
        event.details?.description ||
        event.image ||
        event.title ||
        'No additional details available',
      severity: String(event.severity || 'unknown').toLowerCase(),
      source: event.host || event.image || 'Unknown host',
      time: event.timestamp || null,
      status: 'open',
      ruleId: event.rule_id || null,
      host: event.host || null,
      pid: event.pid || null
    }))
    .sort((a, b) => {
      return Date.parse(b.time || 0) - Date.parse(a.time || 0);
    });
}

module.exports = { readEvents, getAlerts };
