const { getBrowser } = require('../browser');
const browserQueue = require('../concurrency');

const BASE_URL = 'https://cinesubz.lk';
const SEARCH_URL = BASE_URL + '/?s=';

module.exports = async function searchRoute(req, res) {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing query param: ?q=movie+name' });

    // Wait in queue
    await browserQueue.enqueue(req);
    if (req.socket.destroyed) {
        browserQueue.release();
        return;
    }

    let page = null;
    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            // Block only heavy non-JS resources (keep JS for AJAX search results)
            if (['stylesheet', 'font', 'media'].includes(type)) return req.abort();
            const u = req.url();
            if (u.includes('disable-devtool')) {
                return req.respond({ status: 200, contentType: 'application/javascript', body: 'window.DisableDevtool=function(){};' });
            }
            if (u.includes('adstudio.cloud') || u.includes('adserver')) return req.abort();
            req.continue();
        });

        // networkidle2: wait until AJAX search results are injected into DOM
        await page.goto(SEARCH_URL + encodeURIComponent(q), {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        // Extra buffer for any deferred JS rendering
        await new Promise(r => setTimeout(r, 1500));

        const results = await page.evaluate(function () {
            var items = [];
            var seen = {};

            // Match any cinesubz domain (handles .lk / .net / .co redirects)
            var cinesubzPattern = /https?:\/\/cinesubz\.(lk|net|co)\//;

            // Paths to skip - not movie pages
            var skipPatterns = [
                '/category/', '/tag/', '/author/', '/page/', '/wp-',
                '/genre/', '/release/', '/cast/', '/account', '/privacy',
                '/terms', '/contact', '/keywords/',
                '/ztcountry/', '/ztcast/', '/?', '#'
            ];

            var allLinks = Array.from(document.querySelectorAll('a[href]'));
            allLinks.forEach(function (link) {
                var href = link.href;
                if (!href || !cinesubzPattern.test(href)) return;
                if (seen[href]) return;

                // Must contain /movies/ or /tvshows/ path AND be a specific post
                if (href.indexOf('/movies/') === -1 && href.indexOf('/tvshows/') === -1) return;
                
                // Skip generic listing pages like /movies/ or /tvshows/
                var isMovie = href.indexOf('/movies/') !== -1;
                var afterPath = isMovie ? (href.split('/movies/')[1] || '') : (href.split('/tvshows/')[1] || '');
                if (!afterPath || afterPath === '' || afterPath.startsWith('page/')) return;

                // Skip unwanted paths
                for (var i = 0; i < skipPatterns.length; i++) {
                    if (href.indexOf(skipPatterns[i]) !== -1) return;
                }

                // Find associated thumbnail image
                var img = link.querySelector('img');
                if (!img) {
                    var el = link.parentElement;
                    for (var j = 0; j < 6 && el; j++) {
                        img = el.querySelector('img');
                        if (img) break;
                        el = el.parentElement;
                    }
                }

                // Get title
                var title = '';
                var parent = link.parentElement;
                if (parent) {
                    var t = parent.querySelector('h2, h3, h4, .item-title, .title');
                    if (t) title = t.textContent.trim();
                }
                if (!title) title = link.textContent.trim();
                if (!title && img) title = img.getAttribute('alt') || '';
                if (!title) {
                    var slug = href.split('/').filter(Boolean).pop() || '';
                    title = slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
                }
                title = title.replace(/\s+/g, ' ').trim();
                if (!title || title.length < 3) return;
                if (/cinesubz/i.test(title)) return;

                var thumbSrc = '';
                if (img) {
                    thumbSrc = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.src || '';
                }

                seen[href] = true;
                items.push({ title: title, url: href, thumbnail: thumbSrc });
            });

            return items.slice(0, 15).map(function (r, i) {
                return { index: i + 1, title: r.title, url: r.url, thumbnail: r.thumbnail };
            });
        });

        await page.close();
        page = null;

        return res.json(results);
    } catch (err) {
        if (page) await page.close().catch(() => {});
        console.error('[/search] Error:', err.message);
        return res.status(500).json({ error: err.message });
    } finally {
        browserQueue.release();
    }
};
