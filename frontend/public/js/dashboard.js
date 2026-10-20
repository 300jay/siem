/* ============================================================================
 * dashboard.js  --  runs ONLY on index.html
 * ============================================================================
 * Loads three things from the server and puts them on screen:
 *   /api/overview           -> the six metric cards
 *   /api/traffic-series     -> the line chart
 *   /api/connection-status  -> the active vs closed bars
 *   /api/protocols          -> the top protocols bars
 * ========================================================================= */

document.addEventListener('DOMContentLoaded', function () {
  loadEverything();

  document.getElementById('refresh-btn').addEventListener('click', async function () {
    var button = this;

    if (button.disabled) return;
    button.disabled = true;

    // Inject spinner CSS directly from JavaScript
    if (!document.getElementById('refresh-loader-style')) {
      var style = document.createElement('style');
      style.id = 'refresh-loader-style';
      style.textContent = `
        .refresh-spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          margin-left: 8px;
          border: 2px solid rgba(255,255,255,0.25);
          border-top-color: #f97316;
          border-radius: 50%;
          animation: refresh-spin 0.7s linear infinite;
          vertical-align: middle;
        }

        @keyframes refresh-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    var spinner = document.createElement('span');
    spinner.className = 'refresh-spinner';
    button.appendChild(spinner);

    try {
      await Promise.all([
        loadMetrics(),
        loadTrafficChart(),
        loadConnectionStatus(),
        loadProtocols()
      ]);
    } finally {
      spinner.remove();
      button.disabled = false;
    }
  });

  setupLiveButton();
});

/* Loads all four pieces at the same time (faster than one after another). */
function loadEverything() {
  loadMetrics();
  loadTrafficChart();
  loadConnectionStatus();
  loadProtocols();
}

/* --- the six cards ------------------------------------------------------ */
async function loadMetrics() {
  var box = document.getElementById('metrics');
  try {
    var data = await NetOps.getJSON('/api/overview');

    box.innerHTML = data.cards.map(function (card) {
      return '' +
        '<div class="metric-card">' +
          '<div class="metric-content">' +
            '<div class="metric-label">' + NetOps.escapeHtml(card.label) + '</div>' +
            '<div class="metric-value">' + NetOps.formatNumber(card.value) + '</div>' +
            '<div class="metric-note">' + NetOps.escapeHtml(card.note) + '</div>' +
          '</div>' +
          '<div class="metric-icon tone-' + card.tone + '"></div>' +
        '</div>';
    }).join('');
  } catch (error) {
    NetOps.showError(box, error);
  }
}

/* --- the line chart ----------------------------------------------------- */
async function loadTrafficChart() {
  var svg = document.getElementById('traffic-chart');
  try {
    var data = await NetOps.getJSON('/api/traffic-series');
    NetOps.drawLineChart(svg, data.points);
  } catch (error) {
    NetOps.showError(svg.parentElement, error);
  }
}

/* --- active vs closed --------------------------------------------------- */
async function loadConnectionStatus() {
  var box = document.getElementById('status-bars');
  try {
    var data = await NetOps.getJSON('/api/connection-status');

    NetOps.drawBars(box, data.rows.map(function (row) {
      var percent = ((row.value / row.total) * 100).toFixed(1);
      return {
        label: row.label,
        value: row.value,
        max: row.total,
        text: NetOps.formatNumber(row.value) + ' (' + percent + '%)',
        tone: row.tone
      };
    }));
  } catch (error) {
    NetOps.showError(box, error);
  }
}

/* --- top protocols ------------------------------------------------------ */
async function loadProtocols() {
  var box = document.getElementById('protocol-bars');
  try {
    var data = await NetOps.getJSON('/api/protocols');
    var rows = data.rows.slice(0, 5);                      // only the top five
    var biggest = rows[0].connections;

    NetOps.drawBars(box, rows.map(function (row, i) {
      return {
        label: row.protocol,
        value: row.connections,
        max: biggest,
        text: NetOps.formatNumber(row.connections) + '  ·  ' + row.share + '%',
        tone: i % 2 === 0 ? null : 'purple'                // alternate the colour
      };
    }));
  } catch (error) {
    NetOps.showError(box, error);
  }
}

/* --- the Go Live button -------------------------------------------------
 * Re-fetches everything every 10 seconds while it is switched on.
 * The timer is REMEMBERED so it can be switched off again -- forgetting to
 * do that is the classic bug that leaves several timers running at once.
 * --------------------------------------------------------------------- */
function setupLiveButton() {
  var button = document.getElementById('live-btn');
  var timer = null;

  button.addEventListener('click', function () {
    if (timer) {
      clearInterval(timer);                 // switch OFF
      timer = null;
      button.classList.remove('is-live');
      button.textContent = '▶ Go Live';
    } else {
      timer = setInterval(loadEverything, 10000);   // switch ON
      button.classList.add('is-live');
      button.textContent = '● Live';
      loadEverything();
    }
  });
}
