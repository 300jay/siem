/* ============================================================================
 * dns-analytics.js  --  runs ONLY on pages/dns-analytics.html
 * ============================================================================
 * Asks the server for:  /api/dns
 *
 * DNS is the system that turns a name like "github.com" into an IP address.
 * Watching it is useful because malware has to look up its server by name
 * too, so odd-looking domains show up here first.
 * ========================================================================= */

document.addEventListener('DOMContentLoaded', function () {
  loadPage();

  document.getElementById('refresh-btn').addEventListener('click', async function () {
    document.getElementById('dns-chart').innerHTML =
      '<div class="loading">Loading <span class="spinner"></span></div>';

    document.querySelector('#dns-table tbody').innerHTML =
      '<tr><td colspan="10"><div class="loading">Loading <span class="spinner"></span></div></td></tr>';

    await loadPage();
  });
});

async function loadPage() {
  var summaryBox = document.getElementById('dns-summary');
  var barsBox = document.getElementById('dns-bars');
  var tbody = document.querySelector('#dns-table tbody');

  try {
    var data = await NetOps.getJSON('/api/dns');

    /* --- the four tiles at the top --- */
    var tiles = [
      { label: 'Total Queries',   value: NetOps.formatNumber(data.summary.totalQueries),  colour: '' },
      { label: 'Unique Domains',  value: NetOps.formatNumber(data.summary.uniqueDomains), colour: 'text-purple' },
      { label: 'Failed Lookups',  value: NetOps.formatNumber(data.summary.failedLookups), colour: 'text-amber' },
      { label: 'Blocked Domains', value: data.summary.blockedDomains,                     colour: 'text-red' }
    ];

    summaryBox.innerHTML = tiles.map(function (tile) {
      return '<div class="stat-tile">' +
               '<div class="stat-tile-label">' + tile.label + '</div>' +
               '<div class="stat-tile-value ' + tile.colour + '">' + tile.value + '</div>' +
             '</div>';
    }).join('');

    /* --- the bars --- */
    var biggest = data.rows[0].queries;
    NetOps.drawBars(barsBox, data.rows.map(function (row) {
      // colour the bar by how risky the domain is
      var tone = row.verdict === 'blocked' ? 'red'
               : row.verdict === 'suspicious' ? 'amber'
               : 'purple';
      return {
        label: row.domain,
        value: row.queries,
        max: biggest,
        text: NetOps.formatNumber(row.queries),
        tone: tone
      };
    }));

    /* --- the table --- */
    tbody.innerHTML = data.rows.map(function (row) {
      return '' +
        '<tr>' +
          '<td class="mono">' + NetOps.escapeHtml(row.domain) + '</td>' +
          '<td><span class="pill pill-grey">' + NetOps.escapeHtml(row.type) + '</span></td>' +
          '<td class="mono">' + row.queries.toLocaleString() + '</td>' +
          '<td>' + verdictPill(row.verdict) + '</td>' +
        '</tr>';
    }).join('');

  } catch (error) {
    NetOps.showError(summaryBox, error);
    barsBox.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty">Could not load.</div></td></tr>';
  }
}

function verdictPill(verdict) {
  var map = { clean: 'pill-green', suspicious: 'pill-amber', blocked: 'pill-red' };
  return '<span class="pill ' + (map[verdict] || 'pill-grey') + '">' + verdict + '</span>';
}
