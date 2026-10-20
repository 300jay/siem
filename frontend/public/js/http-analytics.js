/* ============================================================================
 * http-analytics.js  --  runs ONLY on pages/http-analytics.html
 * ============================================================================
 * Asks the server for:  /api/http
 *
 * Status codes in short:
 *   2xx = it worked          3xx = go look somewhere else
 *   4xx = the caller was wrong   5xx = the server broke
 * ========================================================================= */

document.addEventListener('DOMContentLoaded', function () {
  loadPage();
  document.getElementById('refresh-btn').addEventListener('click', loadPage);
});

async function loadPage() {
  var summaryBox = document.getElementById('http-summary');
  var barsBox = document.getElementById('status-bars');
  var tbody = document.querySelector('#http-table tbody');

  try {
    var data = await NetOps.getJSON('/api/http');

    /* --- the four tiles --- */
    var tiles = [
      { label: 'Total Requests',  value: NetOps.formatNumber(data.summary.totalRequests), colour: '' },
      { label: 'Avg Response',    value: data.summary.avgResponseMs + ' ms',              colour: 'text-purple' },
      { label: 'Error Rate',      value: data.summary.errorRate + ' %',                   colour: 'text-amber' },
      { label: 'Largest Payload', value: data.summary.largestPayloadMb + ' MB',           colour: '' }
    ];

    summaryBox.innerHTML = tiles.map(function (tile) {
      return '<div class="stat-tile">' +
               '<div class="stat-tile-label">' + tile.label + '</div>' +
               '<div class="stat-tile-value ' + tile.colour + '">' + tile.value + '</div>' +
             '</div>';
    }).join('');

    /* --- status code bars --- */
    var biggest = Math.max.apply(null, data.statusCodes.map(function (s) { return s.count; }));
    NetOps.drawBars(barsBox, data.statusCodes.map(function (code) {
      return {
        label: code.code,
        value: code.count,
        max: biggest,
        text: code.count.toLocaleString(),
        tone: code.tone
      };
    }));

    /* --- the endpoint table --- */
    tbody.innerHTML = data.rows.map(function (row) {
      // slow endpoints get an amber number so they stand out
      var speedClass = row.avgMs > 500 ? 'text-amber' : '';
      return '' +
        '<tr>' +
          '<td class="mono">' + NetOps.escapeHtml(row.path) + '</td>' +
          '<td><span class="pill pill-purple">' + NetOps.escapeHtml(row.method) + '</span></td>' +
          '<td class="mono">' + row.requests.toLocaleString() + '</td>' +
          '<td class="mono ' + speedClass + '">' + row.avgMs + ' ms</td>' +
          '<td>' + statusPill(row.status) + '</td>' +
        '</tr>';
    }).join('');

  } catch (error) {
    NetOps.showError(summaryBox, error);
    barsBox.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty">Could not load.</div></td></tr>';
  }
}

/* 200 -> green, 404 -> amber, 500 -> red */
function statusPill(code) {
  var cls = code >= 500 ? 'pill-red'
          : code >= 400 ? 'pill-amber'
          : 'pill-green';
  return '<span class="pill ' + cls + '">' + code + '</span>';
}
