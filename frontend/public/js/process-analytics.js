/* ============================================================================
 * process-analytics.js  --  runs ONLY on pages/process-analytics.html
 * ============================================================================
 * Asks the server for:  /api/processes
 *
 * This page answers "which PROGRAM is making these connections?" -- useful
 * because an unfamiliar program talking to the internet is a classic sign
 * that something is wrong.
 * ========================================================================= */

document.addEventListener('DOMContentLoaded', function () {
  loadPage();
  document.getElementById('refresh-btn').addEventListener('click', loadPage);
});

async function loadPage() {
  var barsBox = document.getElementById('process-bars');
  var tbody = document.querySelector('#process-table tbody');

  try {
    var data = await NetOps.getJSON('/api/processes');

    /* --- the bars --- */
    var biggest = Math.max.apply(null, data.rows.map(function (r) { return r.connections; }));

    NetOps.drawBars(barsBox, data.rows.map(function (row) {
      // a high-risk process gets a red bar so your eye goes straight to it
      var tone = row.risk === 'high' ? 'red'
               : row.risk === 'medium' ? 'amber'
               : 'purple';
      return {
        label: row.process,
        value: row.connections,
        max: biggest,
        text: row.connections.toLocaleString(),
        tone: tone
      };
    }));

    /* --- the table --- */
    tbody.innerHTML = data.rows.map(function (row) {
      return '' +
        '<tr>' +
          '<td class="mono"><strong>' + NetOps.escapeHtml(row.process) + '</strong></td>' +
          '<td class="mono">' + NetOps.escapeHtml(row.host) + '</td>' +
          '<td class="mono">' + row.connections.toLocaleString() + '</td>' +
          '<td class="mono">' + NetOps.formatBytes(row.bytes) + '</td>' +
          '<td class="mono">' + row.cpu + ' %</td>' +
          '<td>' + riskPill(row.risk) + '</td>' +
        '</tr>';
    }).join('');

  } catch (error) {
    NetOps.showError(barsBox, error);
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty">Could not load.</div></td></tr>';
  }
}

function riskPill(risk) {
  var map = { high: 'pill-red', medium: 'pill-amber', low: 'pill-green' };
  return '<span class="pill ' + (map[risk] || 'pill-grey') + '">' + risk + '</span>';
}
