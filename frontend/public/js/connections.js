/* ============================================================================
 * connections.js  --  runs ONLY on pages/connections.html
 * ============================================================================
 * Asks the server for:  /api/connections
 *
 * IMPORTANT DIFFERENCE from the other pages:
 * the filters here are sent TO THE SERVER as part of the web address, e.g.
 *
 *     /api/connections?protocol=HTTPS&severity=high
 *
 * The server does the filtering and sends back only the matching rows.
 * That is the right way round -- once there is a real database with millions
 * of rows, you never want to send them all to the browser and filter there.
 * ========================================================================= */

document.addEventListener('DOMContentLoaded', function () {
  loadConnections();

  // re-load whenever any filter changes
  ['f-source', 'f-destination', 'f-protocol', 'f-severity', 'f-status']
    .forEach(function (id) {
      document.getElementById(id).addEventListener('change', loadConnections);
    });

  document.getElementById('refresh-btn').addEventListener('click', loadConnections);

  document.getElementById('reset-filters').addEventListener('click', function () {
    document.getElementById('f-source').value = '';
    document.getElementById('f-destination').value = '';
    document.getElementById('f-protocol').value = 'All';
    document.getElementById('f-severity').value = 'All';
    document.getElementById('f-status').value = 'All';
    loadConnections();
  });
});

/* Builds the web address with the current filters attached. */
function buildUrl() {
  var params = new URLSearchParams();

  var source      = document.getElementById('f-source').value.trim();
  var destination = document.getElementById('f-destination').value.trim();
  var protocol    = document.getElementById('f-protocol').value;
  var severity    = document.getElementById('f-severity').value;
  var status      = document.getElementById('f-status').value;

  if (source)      params.set('source', source);
  if (destination) params.set('destination', destination);
  if (protocol !== 'All') params.set('protocol', protocol);
  if (severity !== 'All') params.set('severity', severity);
  if (status   !== 'All') params.set('status', status);

  var query = params.toString();
  return '/api/connections' + (query ? '?' + query : '');
}

async function loadConnections() {
  var tbody = document.querySelector('#connections-table tbody');
  var counter = document.getElementById('row-count');

  tbody.innerHTML = '<tr><td colspan="9"><div class="loading">Loading</div></td></tr>';

  try {
    var data = await NetOps.getJSON(buildUrl());

    counter.textContent = data.total + ' connection' + (data.total === 1 ? '' : 's');

    if (data.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9">' +
        '<div class="empty">No connections match these filters.</div></td></tr>';
      return;
    }

    tbody.innerHTML = data.rows.map(function (row) {
      return '' +
        '<tr>' +
          '<td><a class="session-link" href="#">' + NetOps.escapeHtml(row.sessionId) + '</a></td>' +
          '<td>' + statusPill(row.status) + '</td>' +
          '<td class="mono">' + NetOps.formatTime(row.startTime) + '</td>' +
          '<td class="mono">' + NetOps.escapeHtml(row.source) + '</td>' +
          '<td class="mono">' + NetOps.escapeHtml(row.destination) + '</td>' +
          '<td class="mono">' + NetOps.escapeHtml(row.protocol) + ' / ' + row.port + '</td>' +
          '<td class="mono">' + NetOps.formatBytes(row.bytes) + '</td>' +
          '<td class="mono">' + row.duration + 's</td>' +
          '<td>' + severityPill(row.severity) + '</td>' +
        '</tr>';
    }).join('');
  } catch (error) {
    counter.textContent = '';
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty">Could not load. ' +
                      NetOps.escapeHtml(error.message) + '</div></td></tr>';
  }
}

/* Turns "active" into a green pill, "closed" into a grey one. */
function statusPill(status) {
  var cls = status === 'active' ? 'pill-green' : 'pill-grey';
  return '<span class="pill ' + cls + '">' + status + '</span>';
}

/* Turns a severity word into the right coloured pill. */
function severityPill(severity) {
  var map = {
    high:   'pill-red',
    medium: 'pill-amber',
    low:    'pill-purple',
    none:   'pill-grey'
  };
  var label = severity === 'none' ? 'clean' : severity;
  return '<span class="pill ' + (map[severity] || 'pill-grey') + '">' + label + '</span>';
}
