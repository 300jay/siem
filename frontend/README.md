# NetworkOps Dashboard

A network analytics dashboard. Node.js server, vanilla HTML/CSS/JavaScript
front end. No build step, no framework.

## Run it

```bash
npm install
npm start
```

Open <http://localhost:3000>. Stop with `Ctrl + C`.

Needs Node.js 18 or newer (`node -v` to check).
Use `npm run dev` to auto-restart when you save a file.

## Pages

| Page | Address |
|---|---|
| Dashboard | `/` |
| Traffic Intelligence | `/pages/traffic-intelligence.html` |
| Connections | `/pages/connections.html` |
| Network Analytics | `/pages/network-analytics.html` |
| DNS Analytics | `/pages/dns-analytics.html` |
| HTTP Analytics | `/pages/http-analytics.html` |
| Process Analytics | `/pages/process-analytics.html` |
| Alerts | `/pages/alerts.html` |

## Layout

```
server.js            starts the server
api/routes.js        every API address      <-- backend work happens here
api/mock-data.js     all the fake data      <-- and here
public/              everything the browser sees
  index.html           Dashboard
  pages/               the other seven pages
  css/styles.css       all styling
  js/common.js         sidebar, header, shared helpers
  js/<page>.js         one file per page
```

## Documentation

- **BACKEND_GUIDE.txt** — connecting a real database. Start here for backend work.
- **EXPLANATION.txt** — every function explained in plain language.

## Keyboard

- `Ctrl/Cmd + K` — focus the search box
- `Esc` — clear the search

## Not built yet

No database, no login, no HTTPS. The Acknowledge/Resolve buttons send their
request but the server does not save it. See the end of EXPLANATION.txt for
the full list.
