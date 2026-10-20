
(function () {
  'use strict';


  var MENU = [
    {
      title: null,                        // first group has no heading
      items: [
        { id: 'dashboard',   label: 'Dashboard',            icon: '📊', file: null },
        { id: 'traffic',     label: 'Traffic Intelligence', icon: '📈', file: 'traffic-intelligence.html' },
        { id: 'connections', label: 'Connections',          icon: '🔗', file: 'connections.html' }
      ]
    },
    {
      title: 'Analytics',
      items: [
        { id: 'network', label: 'Network Analytics', icon: '🌐', file: 'network-analytics.html' },
        { id: 'dns',     label: 'DNS Analytics',     icon: '📡', file: 'dns-analytics.html' },
        { id: 'process', label: 'Process Analytics', icon: '⚙️', file: 'process-analytics.html' }
      ]
    },
    {
      title: 'Administration',
      items: [
        { id: 'alerts', label: 'Alerts', icon: '🚨', file: 'alerts.html', badge: 3 }
      ]
    }
  ];

  /* -----------------------------------------------------------------------
   * Work out how to reach other pages from wherever we currently are.
   * index.html sits at the top, the rest sit inside pages/, so the links
   * need a different prefix depending on which one is open.
   * -------------------------------------------------------------------- */
  var inPagesFolder = window.location.pathname.indexOf('/pages/') !== -1;
  var toRoot  = inPagesFolder ? '../' : '';
  var toPages = inPagesFolder ? '' : 'pages/';

  function linkFor(item) {
    return item.file === null ? toRoot + 'index.html' : toPages + item.file;
  }

  /* -----------------------------------------------------------------------
   * buildShell()
   * Puts the galaxy background, the sidebar and the top header onto the page.
   * Runs automatically as soon as the page loads.
   * -------------------------------------------------------------------- */
  function buildShell() {
    var currentPage = document.body.getAttribute('data-page') || '';

    // --- the three galaxy layers (see styles.css section 2) ---
    ['galaxy', 'galaxy-stars', 'galaxy-glints'].forEach(function (cls) {
      var layer = document.createElement('div');
      layer.className = cls;
      document.body.appendChild(layer);
    });

    // --- the sidebar ---
    var navHtml = '';
    MENU.forEach(function (group) {
      navHtml += '<div class="nav-section">';
      if (group.title) {
        navHtml += '<div class="nav-section-title">' + group.title + '</div>';
      }
      group.items.forEach(function (item) {
        var isActive = item.id === currentPage ? ' active' : '';
        navHtml +=
          '<a href="' + linkFor(item) + '" class="nav-item' + isActive + '">' +
            '<span class="nav-icon">' + item.icon + '</span>' +
            '<span class="nav-label">' + item.label + '</span>' +
            (item.badge ? '<span class="badge">' + item.badge + '</span>' : '') +
          '</a>';
      });
      navHtml += '</div>';
    });

    var sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.innerHTML =
      '<div class="sidebar-header">' +
        '<a class="logo" href="' + toRoot + 'index.html">' +
          '<div class="logo-icon">⚡</div>' +
          '<span class="logo-text">NetworkOps</span>' +
        '</a>' +
      '</div>' +
      '<nav class="sidebar-nav">' + navHtml + '</nav>';

    // --- the top header ---
    var header = document.createElement('header');
    header.className = 'top-header';
    header.innerHTML =
      '<div class="header-search">' +
        '<span class="search-icon">🔍</span>' +
        '<input type="text" class="search-input" placeholder="Search this page…  (Ctrl + K)">' +
      '</div>' +
      '<div class="header-controls">' +
        '<a class="header-btn" href="' + toPages + 'alerts.html" title="Alerts">🔔</a>' +
        '<button class="header-btn" title="Account">👤</button>' +
      '</div>';

    // --- slot everything into place around the page's own content ---
    var container = document.querySelector('.app-container');
    var main = document.querySelector('.main-content');
    container.insertBefore(sidebar, container.firstChild);
    main.insertBefore(header, main.firstChild);

    wireSearch();
  }

  /* -----------------------------------------------------------------------
   * The header search box.
   * It hides any table row that does not contain what you typed.
   * Waits 250ms after you stop typing so it does not run on every keystroke.
   * -------------------------------------------------------------------- */
  function wireSearch() {
    var box = document.querySelector('.search-input');
    if (!box) return;

    var timer = null;
    box.addEventListener('input', function () {
      clearTimeout(timer);
      var text = box.value.toLowerCase().trim();
      timer = setTimeout(function () { filterTables(text); }, 250);
    });

    box.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { box.value = ''; filterTables(''); }
    });

    // Ctrl+K (or Cmd+K on a Mac) jumps to the search box
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        box.focus();
      }
    });
  }

  function filterTables(text) {
    document.querySelectorAll('.data-table tbody tr').forEach(function (row) {
      var matches = row.textContent.toLowerCase().indexOf(text) !== -1;
      row.style.display = matches ? '' : 'none';
    });
  }

  /* =========================================================================
   * getJSON(url)
   * The ONE way every page talks to the server.
   *
   *   var data = await NetOps.getJSON('/api/alerts');
   *
   * It asks the server for the address, waits for the answer, and turns the
   * reply into a normal JavaScript object. If anything goes wrong it throws
   * an error with a readable message.
   * ====================================================================== */
  async function getJSON(url) {
    var response = await fetch(url);
    if (!response.ok) {
      throw new Error('Server replied ' + response.status + ' for ' + url);
    }
    return response.json();
  }

  /* sendJSON(url, method, body) -- used to CHANGE something on the server */
  async function sendJSON(url, method, body) {
    var response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error('Server replied ' + response.status + ' for ' + url);
    }
    return response.json();
  }

  /* =========================================================================
   * SMALL HELPERS
   * ====================================================================== */

  /* 1536 -> "1.5 K"   |   9014 -> "9 K" */
  function formatNumber(n) {
    if (n === null || n === undefined) return '-';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
    return String(n);
  }

  /* 1048576 -> "1 MB" */
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var step = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, step)).toFixed(1).replace('.0', '') + ' ' + units[step];
  }

  /* an ISO date -> "14 Oct, 11:42" */
  function formatTime(iso) {
    var d = new Date(iso);
    return d.toLocaleString(undefined, {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  /* an ISO date -> "6 min ago" */
  function timeAgo(iso) {
    var seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60)    return 'just now';
    if (seconds < 3600)  return Math.floor(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hr ago';
    return Math.floor(seconds / 86400) + ' days ago';
  }

  /* Stops text from breaking the page if it ever contains < or >.
     Always run user or server text through this before putting it in HTML. */
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* Shows a spinner inside an element while its data loads. */
  function showLoading(el, message) {
    el.innerHTML = '<div class="loading">' + (message || 'Loading') + '</div>';
  }

  /* Shows a red error box, used when getJSON() fails. */
  function showError(el, error) {
    el.innerHTML = '<div class="error-box"><strong>Could not load this.</strong><br>' +
                   escapeHtml(error.message) + '</div>';
    console.error(error);
  }

  /* =========================================================================
   * drawLineChart(svgElement, points)
   * Draws the traffic line chart. `points` is [{label, value}, ...].
   * Pure SVG built by hand -- no chart library needed.
   * ====================================================================== */
  function drawLineChart(svg, points) {
    var W = 600, H = 210, padL = 38, padR = 12, padT = 14, padB = 26;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;

    var values = points.map(function (p) { return p.value; });
    var max = Math.max.apply(null, values) * 1.1;

    function x(i) { return padL + (i / (points.length - 1)) * innerW; }
    function y(v) { return padT + innerH - (v / max) * innerH; }

    var parts = [];

    // four faint horizontal grid lines, with a number beside each
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (g / 4) * innerH;
      var gv = Math.round(max - (g / 4) * max);
      parts.push('<line class="grid-line" x1="' + padL + '" y1="' + gy +
                 '" x2="' + (W - padR) + '" y2="' + gy + '"/>');
      parts.push('<text class="axis-label" x="' + (padL - 7) + '" y="' + (gy + 3) +
                 '" text-anchor="end">' + formatNumber(gv) + '</text>');
    }

    // the line itself
    var line = points.map(function (p, i) { return x(i) + ',' + y(p.value); }).join(' ');
    parts.push('<polygon points="' + line + ' ' + x(points.length - 1) + ',' +
               (padT + innerH) + ' ' + padL + ',' + (padT + innerH) +
               '" fill="url(#fadeOrange)"/>');
    parts.push('<polyline points="' + line + '" fill="none" stroke="#ff7a18" ' +
               'stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');

    // a dot on every 4th point, plus its hour label
    points.forEach(function (p, i) {
      if (i % 4 !== 0 && i !== points.length - 1) return;
      parts.push('<circle cx="' + x(i) + '" cy="' + y(p.value) + '" r="3" fill="#a855f7"/>');
      parts.push('<text class="axis-label" x="' + x(i) + '" y="' + (H - 8) +
                 '" text-anchor="middle">' + p.label + '</text>');
    });

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML =
      '<defs><linearGradient id="fadeOrange" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#ff7a18" stop-opacity="0.34"/>' +
        '<stop offset="100%" stop-color="#ff7a18" stop-opacity="0"/>' +
      '</linearGradient></defs>' + parts.join('');
  }

  /* =========================================================================
   * drawBars(container, rows)
   * Draws a list of horizontal bars.
   * `rows` is [{ label, value, max, text, tone }, ...]
   * ====================================================================== */
  function drawBars(container, rows) {
    container.innerHTML = rows.map(function (r) {
      var percent = r.max > 0 ? Math.round((r.value / r.max) * 100) : 0;
      var toneClass = r.tone ? ' fill-' + r.tone : '';
      return '<div class="bar-row">' +
               '<div class="bar-label">' + escapeHtml(r.label) + '</div>' +
               '<div class="bar-track">' +
                 '<div class="bar-fill' + toneClass + '" style="width:' + percent + '%"></div>' +
               '</div>' +
               '<div class="bar-value">' + escapeHtml(r.text) + '</div>' +
             '</div>';
    }).join('');
  }

  /* =========================================================================
   * drawDonut(svg, slices)
   * Draws a ring chart. `slices` is [{ label, value, colour }, ...].
   * Uses one circle per slice with a dashed outline -- a common CSS trick
   * that avoids any arc maths.
   * ====================================================================== */
  function drawDonut(svg, slices) {
    var total = slices.reduce(function (sum, s) { return sum + s.value; }, 0);
    var radius = 60, circumference = 2 * Math.PI * radius;
    var offset = 0;

    var circles = slices.map(function (s) {
      var portion = total > 0 ? s.value / total : 0;
      var dash = portion * circumference;
      var c = '<circle cx="80" cy="80" r="' + radius + '" fill="none" ' +
              'stroke="' + s.colour + '" stroke-width="20" ' +
              'stroke-dasharray="' + dash + ' ' + (circumference - dash) + '" ' +
              'stroke-dashoffset="' + (-offset) + '" ' +
              'transform="rotate(-90 80 80)"/>';
      offset += dash;
      return c;
    }).join('');

    svg.setAttribute('viewBox', '0 0 160 160');
    svg.innerHTML = circles;
  }

  /* =========================================================================
   * exportTableToCSV()
   * Turns the first table on the page into a CSV file and downloads it.
   * Nothing is sent anywhere -- the file is built right here in the browser.
   * ====================================================================== */
  function exportTableToCSV(filename) {
    var table = document.querySelector('.data-table');
    if (!table) { alert('There is no table on this page to export.'); return; }

    var lines = [];
    table.querySelectorAll('tr').forEach(function (row) {
      if (row.style.display === 'none') return;          // skip filtered-out rows
      var cells = row.querySelectorAll('th, td');
      var values = [];
      cells.forEach(function (cell) {
        // a double quote inside a value must be written twice -- the CSV rule
        values.push('"' + cell.textContent.trim().replace(/"/g, '""') + '"');
      });
      lines.push(values.join(','));
    });

    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || ('netops-' + new Date().toISOString().slice(0, 10) + '.csv');
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /* Wires up any button with class "export-btn" on the page. */
  function wireExportButton() {
    var btn = document.querySelector('.export-btn');
    if (btn) btn.addEventListener('click', function () { exportTableToCSV(); });
  }

  /* =========================================================================
   * Make everything above available to the page files.
   * ====================================================================== */
  window.NetOps = {
    getJSON: getJSON,
    sendJSON: sendJSON,
    formatNumber: formatNumber,
    formatBytes: formatBytes,
    formatTime: formatTime,
    timeAgo: timeAgo,
    escapeHtml: escapeHtml,
    showLoading: showLoading,
    showError: showError,
    drawLineChart: drawLineChart,
    drawBars: drawBars,
    drawDonut: drawDonut,
    exportTableToCSV: exportTableToCSV,
    wireExportButton: wireExportButton
  };

  /* Build the sidebar and header as soon as the HTML is ready. */
  document.addEventListener('DOMContentLoaded', function () {
    buildShell();
    wireExportButton();
  });
})();
