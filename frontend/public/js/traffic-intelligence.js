/* ============================================================================
 * traffic-intelligence.js
 * Uses the existing /api/traffic-intelligence endpoint
 * ========================================================================== */

document.addEventListener('DOMContentLoaded', function () {
    loadPage();

    var refreshButton = document.getElementById('refresh-btn');
    if (refreshButton) {
        refreshButton.addEventListener('click', loadPage);
    }
});

async function loadPage() {
    var legend = document.getElementById('direction-legend');
    var bars = document.getElementById('asn-bars');
    var tbody = document.querySelector('#geo-table tbody');

    try {
        if (bars) bars.innerHTML = '<div class="loading">Loading...</div>';
        if (tbody) tbody.innerHTML =
            '<tr><td colspan="5"><div class="loading">Loading...</div></td></tr>';

        var data = await NetOps.getJSON(
            'http://localhost:3000/api/traffic-intelligence?limit=100'
        );

        loadDirection(data);
        loadAsn(data);
        loadGeo(data);

    } catch (error) {
        if (legend) NetOps.showError(legend, error);
        if (bars) NetOps.showError(bars, error);

        if (tbody) {
            tbody.innerHTML =
                '<tr><td colspan="5"><div class="empty">' +
                NetOps.escapeHtml(error.message) +
                '</div></td></tr>';
        }
    }
}

/* --- Protocol distribution (replaces direction data) -------------------- */

function loadDirection(data) {
    var svg = document.getElementById('direction-donut');
    var legend = document.getElementById('direction-legend');

    var colours = ['#ff7a18', '#a855f7', '#ffc53d', '#9a92b8'];

    var rows = data.protocols || [];
    var total = rows.reduce(function (sum, row) {
        return sum + row.connections;
    }, 0);

    var chartRows = rows.map(function (row, index) {
        return {
            label: row.protocol.toUpperCase(),
            value: row.connections,
            colour: colours[index % colours.length]
        };
    });

    if (svg) {
        if (total > 0) {
            NetOps.drawDonut(svg, chartRows);
        } else {
            svg.innerHTML = '';
        }
    }

    if (legend) {
        legend.innerHTML = total
            ? rows.map(function (row, index) {
                var percent = (row.connections / total * 100).toFixed(1);

                return '<div class="legend-item">' +
                    '<span class="legend-dot" style="background:' +
                    colours[index % colours.length] + '"></span>' +
                    '<span>' + NetOps.escapeHtml(
                        row.protocol.toUpperCase()
                    ) + '</span>' +
                    '<strong class="mono" style="margin-left:auto">' +
                    percent + '%</strong></div>';
            }).join('')
            : '<div class="empty">No protocol data available.</div>';
    }
}

/* --- Top source IPs (replaces provider/ASN data) ------------------------ */

function loadAsn(data) {
    var box = document.getElementById('asn-bars');
    if (!box) return;

    var rows = data.topSources || [];

    if (!rows.length) {
        box.innerHTML = '<div class="empty">No source IP data available.</div>';
        return;
    }

    var biggest = rows[0].connections || 1;

    NetOps.drawBars(box, rows.map(function (row, index) {
        return {
            label: row.ip,
            value: row.connections,
            max: biggest,
            text: row.connections.toLocaleString() + ' connections',
            tone: index % 2 === 0 ? 'purple' : null
        };
    }));
}

/* --- Top destination IPs (replaces country/geo data) -------------------- */

function loadGeo(data) {
    var tbody = document.querySelector('#geo-table tbody');
    if (!tbody) return;

    var rows = data.topDestinations || [];
    var events = data.events || [];

    var bytesByIP = {};

    events.forEach(function (event) {
        var ip = event.dst_ip;

        if (ip) {
            bytesByIP[ip] = (bytesByIP[ip] || 0) +
                (Number(event.size) || 0);
        }
    });

    var total = rows.reduce(function (sum, row) {
        return sum + row.connections;
    }, 0);

    if (!rows.length) {
        tbody.innerHTML =
            '<tr><td colspan="5">No destination IP data available.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map(function (row) {
        var share = total
            ? (row.connections / total * 100).toFixed(1)
            : '0.0';

        var transferred = NetOps.formatBytes(
            bytesByIP[row.ip] || 0
        );

        return '<tr>' +
            '<td><strong>' + NetOps.escapeHtml(row.ip) + '</strong></td>' +
            '<td><span class="pill pill-purple">IP</span></td>' +
            '<td class="mono">' + row.connections.toLocaleString() + '</td>' +
            '<td class="mono">' + transferred + '</td>' +
            '<td class="mono">' + share + '%</td>' +
            '</tr>';
    }).join('');
}