const { getBrowser } = require('../browser');
const browserQueue = require('../concurrency');

module.exports = async function detailsRoute(req, res) {
    const url = (req.query.url || '').trim();
    if (!url) return res.status(400).json({ error: 'Missing query param: ?url=movie_page_url' });

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
            const u = req.url();
            const type = req.resourceType();
            // Block heavy non-essential resources (keep images for poster)
            if (['stylesheet', 'font', 'media'].includes(type)) return req.abort();
            if (u.includes('disable-devtool')) {
                return req.respond({ status: 200, contentType: 'application/javascript', body: 'window.DisableDevtool=function(){};' });
            }
            if (u.includes('adstudio.cloud') || u.includes('adserver')) return req.abort();
            req.continue();
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2000));

        const details = await page.evaluate(function () {

            // ── Title ──────────────────────────────────────────────────────
            var title = document.title.split('|')[0].replace('Sinhala Subtitles', '').trim();

            // ── Thumbnail / Poster — read from og:image meta tag (most reliable) ───
            var thumbnail = '';
            var ogImg = document.querySelector('meta[property="og:image"]');
            if (ogImg) thumbnail = ogImg.getAttribute('content') || '';
            if (!thumbnail) {
                // Fallback: first wp-content/uploads image that isn't the site logo
                var allImgs = Array.from(document.querySelectorAll('img'));
                for (var i = 0; i < allImgs.length; i++) {
                    var src = allImgs[i].src || allImgs[i].getAttribute('data-src') || allImgs[i].getAttribute('data-lazy-src') || '';
                    if (src.includes('wp-content/uploads') && !src.toLowerCase().includes('logo') && !src.toLowerCase().includes('cinesibz')) {
                        thumbnail = src;
                        break;
                    }
                }
            }

            // ── IMDb Rating ────────────────────────────────────────────────
            var imdb = '';
            var imdbEl = document.querySelector('a[href*="imdb.com"], [class*="imdb"], [id*="imdb"]');
            if (imdbEl) imdb = imdbEl.textContent.trim().replace(/\s+/g, ' ');

            // ── Duration ───────────────────────────────────────────────────
            var duration = '';
            var allEls = Array.from(document.querySelectorAll('span, div, p, li, td'));
            for (var i = 0; i < allEls.length; i++) {
                var el = allEls[i];
                if (el.children.length > 0) continue;
                var m = el.textContent.match(/(\d{2,3})\s*min/i);
                if (m) { duration = m[0]; break; }
            }

            // ── Views ──────────────────────────────────────────────────────
            var views = '';
            for (var i = 0; i < allEls.length; i++) {
                var el = allEls[i];
                if (el.children.length > 0) continue;
                var m = el.textContent.match(/([\d,]+)\s*views?/i);
                if (m) { views = m[1]; break; }
            }

            // ── Site Rating ────────────────────────────────────────────────
            var siteRating = '';
            var ratingEl = document.querySelector(
                '[class*="rating-count"], [class*="site-rating"], .rate, [itemprop="ratingValue"], .num-rate'
            );
            if (ratingEl) siteRating = ratingEl.textContent.trim().split(' ')[0];
            if (!siteRating) {
                // Try to get from a standalone number near stars
                var starParent = document.querySelector('[class*="star"], [class*="rating"]');
                if (starParent) {
                    var numEl = starParent.previousElementSibling || starParent.parentElement?.querySelector('b, strong, span');
                    if (numEl) siteRating = numEl.textContent.trim().split(' ')[0];
                }
            }

            // ── Language Badge ─────────────────────────────────────────────
            var language = '';
            var langPatterns = /^(telugu|sinhala|tamil|hindi|english|malayalam|kannada|bengali|chinese|japanese|korean)$/i;
            var allBadges = Array.from(document.querySelectorAll('span, [class*="badge"], [class*="lang"], a'));
            for (var i = 0; i < allBadges.length; i++) {
                var txt = allBadges[i].textContent.trim();
                if (langPatterns.test(txt)) { language = txt; break; }
            }

            // ── Year, Country, Director ────────────────────────────────────
            var year = '', country = '', director = '';

            // Strategy: look for label:value pairs in DOM siblings
            var allNodes = Array.from(document.querySelectorAll('*'));
            allNodes.forEach(function (el) {
                if (el.children.length > 2) return;
                var txt = el.textContent.trim();

                // Check if this element is a label
                var lowerTxt = txt.toLowerCase().replace(':', '').trim();
                var nextSib = el.nextElementSibling;
                var nextVal = nextSib ? nextSib.textContent.trim() : '';

                if (lowerTxt === 'year') year = year || nextVal;
                if (lowerTxt === 'country') country = country || nextVal;
                if (lowerTxt === 'director') director = director || nextVal;
            });

            // Fallback: scan for year pattern (2020-2029)
            if (!year) {
                var yearM = title.match(/(20[0-9]{2})/);
                if (yearM) year = yearM[1];
            }

            // ── Genres / Tags ──────────────────────────────────────────────
            var genres = [];
            var seenG = {};
            document.querySelectorAll('a[href*="/genre/"], a[rel="tag"], a[href*="genre"]').forEach(function (el) {
                var g = el.textContent.trim();
                if (g && g.length < 30 && !seenG[g]) { genres.push(g); seenG[g] = true; }
            });
            // Also read from tag line like ".NEW, #cineru, Action, Comedy"
            if (genres.length === 0) {
                var tagLine = Array.from(document.querySelectorAll('p, div')).find(function (el) {
                    return el.children.length < 5 && /\bAction|Comedy|Drama|Thriller|Horror|Romance|Mystery|Telugu\b/i.test(el.textContent);
                });
                if (tagLine) {
                    tagLine.textContent.split(',').forEach(function (t) {
                        t = t.trim().replace(/^[.#]/, '').trim();
                        if (t.length > 1 && t.length < 25 && !seenG[t]) { genres.push(t); seenG[t] = true; }
                    });
                }
            }

            // ── Cast ───────────────────────────────────────────────────────
            var cast = [];
            var castContainers = document.querySelectorAll(
                '[class*="cast"] [class*="item"], [class*="cast"] li, [class*="people"] li, [class*="actor"]'
            );
            castContainers.forEach(function (el) {
                var img = el.querySelector('img');
                var nameEl = el.querySelector('[class*="name"], h4, h5, p:first-of-type, span:first-of-type');
                var roleEl = el.querySelector('[class*="role"], [class*="char"], small, p:last-of-type');
                if (nameEl) {
                    cast.push({
                        name: nameEl.textContent.trim(),
                        role: roleEl ? roleEl.textContent.trim() : '',
                        photo: img ? (img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.src || '') : ''
                    });
                }
            });

            // ── Download Links ────────────────────────────────────────────
            var downloads = [];
            var seenDl = {};
            document.querySelectorAll('a[href]').forEach(function (el) {
                var href = el.href || '';

                // Include zt-links and api-links download URLs
                if (!href.includes('/zt-links/') && !href.includes('/api-')) return;
                if (seenDl[href]) return;
                seenDl[href] = true;

                // Get quality from surrounding card
                var card = el.closest('div') || el.closest('li') || el.parentElement;
                var cardText = card ? card.textContent.trim().replace(/\s+/g, ' ') : el.textContent.trim();
                var qualityM = cardText.match(/(\d{3,4}p[^,\n\|]*)/i);
                var typeM = cardText.match(/WEB(?:-DL|-Rip)?|BluRay|BDRip|HDRip|CAM/i);
                var quality = '';
                if (qualityM) quality = qualityM[1].trim();
                else if (typeM) quality = typeM[0].trim();
                else quality = el.textContent.trim() || cardText.substring(0, 60);

                downloads.push({ quality: quality, url: href });
            });

            // ── Episodes (for TV Shows) ────────────────────────────────────
            var episodes = [];
            var seenEp = {};
            document.querySelectorAll('a[href*="/episodes/"]').forEach(function (el) {
                var href = el.href || '';
                var epTitle = el.textContent.trim().replace(/\s+/g, ' ');
                var season = el.getAttribute('data-season');
                var episodeNum = el.getAttribute('data-episode');

                if (season && episodeNum) {
                    var sFormat = season.length === 1 ? '0' + season : season;
                    var eFormat = episodeNum.length === 1 ? '0' + episodeNum : episodeNum;
                    // Remove the redundant number at the start of epTitle if it exists
                    epTitle = epTitle.replace(new RegExp('^' + episodeNum + '\\s+'), '');
                    epTitle = 'S' + sFormat + 'E' + eFormat + ' - ' + epTitle;
                }

                if (href && epTitle && !seenEp[href]) {
                    episodes.push({ title: epTitle, url: href });
                    seenEp[href] = true;
                }
            });

            return {
                title,
                thumbnail,
                imdb,
                duration,
                year,
                country,
                language,
                genres,
                director,
                views,
                siteRating,
                cast,
                downloads,
                episodes
            };
        });

        await page.close();
        page = null;

        return res.json(details);
    } catch (err) {
        if (page) await page.close().catch(() => {});
        console.error('[/details] Error:', err.message);
        return res.status(500).json({ error: err.message });
    } finally {
        browserQueue.release();
    }
};
