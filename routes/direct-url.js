const { getBrowser } = require('../browser');
const browserQueue = require('../concurrency');

module.exports = async function directUrlRoute(req, res) {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing body field: url (zt-links URL)' });

    // Wait in queue
    await browserQueue.enqueue(req);
    if (req.socket.destroyed) {
        browserQueue.release();
        return;
    }

    let ztPage = null;
    let serverPage = null;

    try {
        const browser = await getBrowser();
        const capturedUrls = [];

        // ══════════════════════════════════════════════════════════════════════
        // PHASE 1: Navigate zt-links → find sonic-cloud server page URL
        // ══════════════════════════════════════════════════════════════════════
        ztPage = await browser.newPage();

        await ztPage.setRequestInterception(true);
        ztPage.on('request', (req) => {
            const u = req.url();
            const type = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(type)) return req.abort();
            if (u.includes('disable-devtool')) {
                return req.respond({ status: 200, contentType: 'application/javascript', body: 'window.DisableDevtool=function(){};' });
            }
            if (u.includes('adstudio.cloud') || u.includes('adserver') || u.includes('fordev.jpg')) return req.abort();
            req.continue();
        });

        await ztPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
        await new Promise(r => setTimeout(r, 6000)); // Railway servers are slower — give zt-links page time

        const ztCurrentUrl = ztPage.url();
        let serverPageUrl = null;

        // Check if already redirected away from cinesubz domain to server page
        const isCinesubzDomain = /cinesubz\.(lk|net|co)/i.test(ztCurrentUrl);
        if (!isCinesubzDomain) {
            serverPageUrl = ztCurrentUrl;
        } else {
            // Find "Go to Download Page" link
            const goLinks = await ztPage.evaluate(function () {
                return Array.from(document.querySelectorAll('a')).filter(function (a) {
                    return a.href && (
                        a.href.includes('sonic-cloud') ||
                        a.href.includes('kavinishka') ||
                        a.href.includes('bot') ||
                        /go.?to|download.?page|get.?file/i.test(a.textContent)
                    );
                }).map(function (a) { return { url: a.href, text: a.textContent.trim() }; });
            });

            if (goLinks.length > 0) {
                serverPageUrl = goLinks[0].url;
            }
        }

        await ztPage.close();
        ztPage = null;

        if (!serverPageUrl) {
            return res.status(422).json({ error: 'Could not find server page URL from zt-links page' });
        }

        // ══════════════════════════════════════════════════════════════════════
        // PHASE 2: Server page (sonic-cloud) → click Direct Download → capture window.open URL
        // ══════════════════════════════════════════════════════════════════════
        serverPage = await browser.newPage();

        // Inject window.open interceptor BEFORE page navigation
        await serverPage.evaluateOnNewDocument(function () {
            window.open = function (url, name, specs) {
                // Broadcast the URL to Puppeteer via console log
                console.log('[INTERCEPTED WINDOW.OPEN] ' + url);
                // Return a dummy object so the site doesn't trigger a fallback download
                return { closed: false, focus: function() {}, close: function() {} };
            };
        });

        // Listen for the intercepted URL via console events
        serverPage.on('console', function (msg) {
            var text = msg.text();
            if (text.indexOf('[INTERCEPTED WINDOW.OPEN] ') === 0) {
                var dlUrl = text.replace('[INTERCEPTED WINDOW.OPEN] ', '').trim();
                if (dlUrl && dlUrl.length > 20 && !capturedUrls.includes(dlUrl)) {
                    capturedUrls.push(dlUrl);
                    console.log('[/direct-url] Captured URL:', dlUrl);
                }
            }
        });

        // Block ads and devtool detectors
        await serverPage.setRequestInterception(true);
        serverPage.on('request', (req) => {
            const u = req.url();
            
            // Abort actual download requests to be 100% safe
            if (u.includes('kavinishka') || u.includes('.mp4') || u.includes('.mkv')) {
                if (!capturedUrls.includes(u) && u.length > 20) {
                    capturedUrls.push(u);
                    console.log('[/direct-url] Captured via request:', u);
                }
                return req.abort();
            }

            if (u.includes('disable-devtool')) {
                return req.respond({ status: 200, contentType: 'application/javascript', body: 'window.DisableDevtool=function(){};' });
            }
            if (u.includes('adstudio.cloud') || u.includes('adserver') || u.includes('fordev.jpg')) return req.abort();
            req.continue();
        });

        await serverPage.goto(serverPageUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});

        // Wait for page JS to fully load (button rendering needs time)
        await new Promise(r => setTimeout(r, 4000));

        // Re-inject interceptor after navigation (some SPAs overwrite window.open)
        await serverPage.evaluate(function () {
            if (!window.__intercepted) {
                window.open = function (url) {
                    console.log('[INTERCEPTED WINDOW.OPEN] ' + url);
                    // Return dummy object
                    return { closed: false, focus: function() {}, close: function() {} };
                };
                window.__intercepted = true;
            }
        }).catch(() => {});

        // ── Find & click visible button.direct-download ──────────────────────
        // Confirmed working method from test.js: select by class + visibility check
        const buttonData = await serverPage.evaluate(function () {
            var buttons = Array.from(document.querySelectorAll('button.direct-download'));
            return buttons.map(function (btn) {
                var style = window.getComputedStyle(btn);
                var rect = btn.getBoundingClientRect();
                return {
                    id: btn.id || '',
                    isVisible: (
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        style.opacity !== '0' &&
                        style.pointerEvents !== 'none' &&
                        rect.width > 0 && rect.height > 0 &&
                        rect.top >= 0 && rect.left >= 0
                    )
                };
            });
        });

        const validButton = buttonData.find(function (b) { return b.isVisible && b.id; });

        if (validButton) {
            console.log('[/direct-url] Clicking button#' + validButton.id);
            await serverPage.click('#' + validButton.id).catch(() => {});
        } else {
            // Fallback: search by button text content
            console.log('[/direct-url] Fallback: searching by text content...');
            const allButtons = await serverPage.$$('a, button');
            for (const btn of allButtons) {
                const shouldClick = await serverPage.evaluate(function (el) {
                    var txt = el.textContent.toLowerCase();
                    if (txt.includes('telegram')) return false;
                    if (txt.includes('direct download') || txt.includes('get file') || txt.includes('download now')) {
                        var rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            el.scrollIntoView({ block: 'center' });
                            return true;
                        }
                    }
                    return false;
                }, btn).catch(() => false);

                if (shouldClick) {
                    await new Promise(r => setTimeout(r, 500));
                    await btn.click().catch(() => {});
                    console.log('[/direct-url] Fallback button clicked.');
                    break;
                }
            }
        }

        // ── Wait for window.open to fire (up to 15 seconds) ─────────────────
        for (let w = 0; w < 15; w++) {
            await new Promise(r => setTimeout(r, 1000));
            if (capturedUrls.length > 0) break;
        }

        await serverPage.close();
        serverPage = null;

        if (capturedUrls.length === 0) {
            return res.status(408).json({
                error: 'Direct download URL not captured within 15s. Button may not have responded.'
            });
        }

        return res.json({ directUrl: capturedUrls[capturedUrls.length - 1] });

    } catch (err) {
        if (ztPage) await ztPage.close().catch(() => {});
        if (serverPage) await serverPage.close().catch(() => {});
        console.error('[/direct-url] Error:', err.message);
        return res.status(500).json({ error: err.message });
    } finally {
        browserQueue.release();
    }
};
