/* ============================================================================
 * network-analytics.js  --  runs ONLY on pages/network-analytics.html
 * ============================================================================
 * Asks the server for:
 *   /api/performance  -> the four performance tiles at the top
 *   /api/protocols    -> the bar chart and the table
 * ========================================================================= */

document.addEventListener('DOMContentLoaded', function () {
  loadPage();

  document.getElementById('refresh-btn').addEventListener('click', async function () {
    document.getElementById('protocol-bars').innerHTML =
      '<div class="loading">Loading <span class="spinner"></span></div>';

    document.querySelector('#protocol-table tbody').innerHTML =
      '<tr><td colspan="4"><div class="loading">Loading <span class="spinner"></span></div></td></tr>';

    await loadPage();
  });
});

function loadPage() {
  loadPerformance();
  loadProtocols();
}

/* --- latency, packet loss, throughput, jitter --------------------------- */
async function loadPerformance() {
  var box = document.getElementById('perf-stats');
  try {
    var data = await NetOps.getJSON('/api/performance');

    // turn "good"/"warn"/"bad" into a colour class
    var colourFor = { good: 'text-green', warn: 'text-amber', bad: 'text-red' };

    box.innerHTML = data.stats.map(function (stat) {
      return '' +
        '<div class="stat-tile">' +
          '<div class="stat-tile-label">' + NetOps.escapeHtml(stat.label) + '</div>' +
          '<div class="stat-tile-value ' + (colourFor[stat.status] || '') + '">' +
            stat.value +
            '<span class="stat-tile-unit">' + NetOps.escapeHtml(stat.unit) + '</span>' +
          '</div>' +
        '</div>';
    }).join('');
  } catch (error) {
    NetOps.showError(box, error);
  }
}

/* --- protocol bars and the full table ----------------------------------- */
async function loadProtocols() {
  var bars = document.getElementById('protocol-bars');
  var tbody = document.querySelector('#protocol-table tbody');

  try {
    var data = await NetOps.getJSON('/api/protocols');
    var biggest = data.rows[0].connections;

    // the bars
    NetOps.drawBars(bars, data.rows.map(function (row, i) {
      return {
        label: row.protocol,
        value: row.connections,
        max: biggest,
        text: row.share + '%',
        tone: i % 2 === 0 ? null : 'purple'
      };
    }));

    // the table
    tbody.innerHTML = data.rows.map(function (row) {
      return '' +
        '<tr>' +
          '<td><strong>' + NetOps.escapeHtml(row.protocol) + '</strong></td>' +
          '<td class="mono">' + row.connections.toLocaleString() + '</td>' +
          '<td class="mono">' + row.share + '%</td>' +
          '<td class="mono">' + NetOps.formatBytes(row.bytes) + '</td>' +
        '</tr>';
    }).join('');
  } catch (error) {
    NetOps.showError(bars, error);
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty">Could not load.</div></td></tr>';
  }
}
