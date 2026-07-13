const express = require('express');
const { closeBrowser } = require('./browser');

const searchRoute   = require('./routes/search');
const detailsRoute  = require('./routes/details');
const directUrlRoute = require('./routes/direct-url');

const app = express();
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────

// 1. Search movies
// GET /search?q=movie+name
app.get('/search', searchRoute);

// 2. Get full movie details + download links
// GET /details?url=https://cinesubz.lk/movies/...
app.get('/details', detailsRoute);

// 3. Get direct download URL from a zt-links URL
// POST /direct-url  { "url": "https://cinesubz.lk/zt-links/xxxxx/" }
app.post('/direct-url', directUrlRoute);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        endpoints: [
            'GET  /search?q=<movie+name>',
            'GET  /details?url=<cinesubz_movie_url>',
            'POST /direct-url  body: { "url": "<zt_links_url>" }'
        ]
    });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('');
    console.log('═'.repeat(55));
    console.log('  🎬  CineSubz API Server');
    console.log('═'.repeat(55));
    console.log(`  URL  : http://localhost:${PORT}`);
    console.log('');
    console.log('  Endpoints:');
    console.log(`  GET  /search?q=<name>`);
    console.log(`  GET  /details?url=<movie_url>`);
    console.log(`  POST /direct-url  { "url": "<zt_links_url>" }`);
    console.log('═'.repeat(55));
    console.log('');
});

// Clean up browser on exit
process.on('SIGINT', async () => {
    console.log('\n[Server] Shutting down...');
    await closeBrowser();
    process.exit(0);
});
