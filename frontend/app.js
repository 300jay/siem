/* ============================================================================
 * server.js  --  THE NODE.JS SERVER. START EVERYTHING WITH: npm start
 * ============================================================================
 *
 * What this file does, in order:
 *
 *   1. Starts a web server using Express (a small, very common Node library).
 *   2. Serves the dashboard pages from the `public/` folder.
 *   3. Hands any address starting with /api/ over to `api/routes.js`.
 *
 * That is the whole thing. Keep it that way -- business logic belongs in
 * `api/routes.js`, not here.
 *
 * ========================================================================= */

const express = require('express');
const path = require('path');
const apiRoutes = require('./api/routes');

const app = express();
const PORT = process.env.PORT || 3001;

/* --- Read JSON bodies ------------------------------------------------------
 * Lets the server understand JSON sent by the browser (used by the
 * Acknowledge / Resolve buttons on the Alerts page).
 * ------------------------------------------------------------------------ */
app.use(express.json());

/* --- Log every request -----------------------------------------------------
 * Prints one line per request so you can see what the frontend is asking for.
 * Very handy while wiring up a backend. Delete it if it gets noisy.
 * ------------------------------------------------------------------------ */
app.use((req, res, next) => {
  console.log(`  ${req.method.padEnd(5)} ${req.url}`);
  next();
});

/* --- The API ---------------------------------------------------------------
 * Anything starting with /api/ goes to api/routes.js.
 * So the route '/overview' in that file becomes '/api/overview' here.
 * ------------------------------------------------------------------------ */
app.use('/api', apiRoutes);

/* --- The website -----------------------------------------------------------
 * Serves every file inside public/ exactly as it sits on disk.
 *   public/index.html        -> http://localhost:3001/
 *   public/css/styles.css    -> http://localhost:3001/css/styles.css
 *   public/pages/alerts.html -> http://localhost:3001/pages/alerts.html
 * ------------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, 'public')));

/* --- Anything else ---------------------------------------------------------
 * If someone asks for a page that does not exist, say so clearly instead of
 * showing a blank screen.
 * ------------------------------------------------------------------------ */
app.use((req, res) => {
  res.status(404).send(
    '<body style="background:#07060f;color:#f3f0ff;font-family:system-ui;padding:60px">' +
    '<h1>404 &mdash; page not found</h1>' +
    '<p>There is no page at <code>' + req.url.replace(/</g, '&lt;') + '</code>.</p>' +
    '<p><a style="color:#ff7a18" href="/">Back to the dashboard</a></p>' +
    '</body>'
  );
});

app.listen(PORT, () => {
  console.log('');
  console.log('  NetworkOps dashboard is running');
  console.log('  ------------------------------------');
  console.log(`  Open this in your browser:  http://localhost:${PORT}`);
  console.log('  Stop the server with:       Ctrl + C');
  console.log('');
});
