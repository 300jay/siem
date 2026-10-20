/* ============================================================================
 * alerts.js  --  runs ONLY on pages/alerts.html
 * ============================================================================
 * Asks the server for:  /api/alerts
 * and sends changes to:  PATCH /api/alerts/<id>
 *
 * This is the only page that CHANGES data rather than just reading it, so it
 * is the best example to copy when you add saving to the rest of the app.
 * ========================================================================= */

document.addEventListener('DOMContentLoaded', function () {
  loadAlerts();

  document.getElementById('f-severity').addEventListener('change', loadAlerts);
  document.getElementById('f-status').addEventListener('change', loadAlerts);
  document.getElementById('refresh-btn').addEventListener('click', loadAlerts);
});

/* Builds the address with the two dropdown filters attached. */
function buildUrl() {
  var params = new URLSearchParams();
  var severity = document.getElementById('f-severity').value;
  var status   = document.getElementById('f-status').value;

  if (severity !== 'All') params.set('severity', severity);
  if (status   !== 'All') params.set('status', status);

  var query = params.toString();
  return '/api/alerts' + (query ? '?' + query : '');
}

async function loadAlerts() {
  var countsBox = document.getElementById('alert-counts');
  var listBox = document.getElementById('alert-list');

  listBox.innerHTML = '<div class="loading">Loading alerts</div>';

  try {
    var data = await NetOps.getJSON(buildUrl());

    drawCounts(countsBox, data.rows);

    if (data.rows.length === 0) {
      listBox.innerHTML = '<div class="empty">No alerts match these filters. ' +
                          'That is usually good news.</div>';
      return;
    }

    listBox.innerHTML = data.rows
      .slice()
      .sort((a, b) => Date.parse(b.time || 0) - Date.parse(a.time || 0))
      .map(buildAlertCard)
      .join('');
      wireActionButtons();

  } catch (error) {
    NetOps.showError(listBox, error);
    countsBox.innerHTML = '';
  }
}

/* --- the four counters along the top ------------------------------------ */
function drawCounts(box, rows) {
  function countOf(severity) {
    return rows.filter(function (r) { return r.severity === severity; }).length;
  }

  var tiles = [
    { label: 'Critical', value: countOf('critical'), colour: 'text-red' },
    { label: 'High',     value: countOf('high'),     colour: 'text-orange' },
    { label: 'Medium',   value: countOf('medium'),   colour: 'text-amber' },
    { label: 'Low',      value: countOf('low'),      colour: 'text-purple' }
  ];

  box.innerHTML = tiles.map(function (tile) {
    return '<div class="stat-tile">' +
             '<div class="stat-tile-label">' + tile.label + '</div>' +
             '<div class="stat-tile-value ' + tile.colour + '">' + tile.value + '</div>' +
           '</div>';
  }).join('');
}

/* --- one alert card ----------------------------------------------------- */
function buildAlertCard(alert) {
  var severityPill = {
    critical: 'pill-red', high: 'pill-orange',
    medium: 'pill-amber', low: 'pill-purple'
  }[alert.severity] || 'pill-grey';

  var statusPill = {
    open: 'pill-red', acknowledged: 'pill-amber', resolved: 'pill-green'
  }[alert.status] || 'pill-grey';

  // a resolved alert does not need any buttons any more
  var buttons = alert.status === 'resolved'
    ? ''
    : '<div class="alert-actions">' +
        (alert.status === 'open'
          ? '<button class="btn btn-sm" data-id="' + alert.id + '" data-status="acknowledged">Acknowledge</button>'
          : '') +
        '<button class="btn btn-sm" data-id="' + alert.id + '" data-status="resolved">Resolve</button>' +
      '</div>';

  return '' +
    '<article class="alert-card alert-' + alert.severity + '">' +
      '<div class="alert-top">' +
        '<div class="alert-title">' + NetOps.escapeHtml(alert.title) + '</div>' +
        '<div style="display:flex;gap:7px">' +
          '<span class="pill ' + severityPill + '">' + alert.severity + '</span>' +
          '<span class="pill ' + statusPill + '">' + alert.status + '</span>' +
        '</div>' +
      '</div>' +
      '<p class="alert-desc">' + NetOps.escapeHtml(alert.description) + '</p>' +
      '<div class="alert-foot">' +
        '<span class="mono">' + NetOps.escapeHtml(alert.id) + '</span>' +
        '<span>' + NetOps.escapeHtml(alert.source) + '</span>' +
        '<span>' + NetOps.timeAgo(alert.time) + '</span>' +
        buttons +
      '</div>' +
    '</article>';
}

/* --- Acknowledge / Resolve ---------------------------------------------
 * Sends the new status to the server, then reloads the list.
 *
 * NOTE FOR THE BACKEND WORK: the server currently replies "ok" without
 * saving anything, so the change disappears on refresh. Once the PATCH route
 * in api/routes.js writes to a database, this page starts working for real
 * with no changes here.
 * --------------------------------------------------------------------- */
function wireActionButtons() {
  document.querySelectorAll('.alert-actions button').forEach(function (button) {
    button.addEventListener('click', async function () {
      var id = button.getAttribute('data-id');
      var status = button.getAttribute('data-status');

      button.disabled = true;
      button.textContent = 'Saving…';

      try {
        var reply = await NetOps.sendJSON('/api/alerts/' + id, 'PATCH', { status: status });

        if (reply.saved === false) {
          // be honest rather than pretending it worked
          alert('The server accepted this, but there is no database yet, so the ' +
                'change will not stick. See the PATCH route in api/routes.js.');
        }
        loadAlerts();
      } catch (error) {
        alert('Could not update that alert: ' + error.message);
        button.disabled = false;
        button.textContent = status === 'resolved' ? 'Resolve' : 'Acknowledge';
      }
    });
  });
}
