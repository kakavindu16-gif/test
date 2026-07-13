const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

let browser = null;
let launchPromise = null;

// Configurable via environment variables for Docker vs local
const IS_HEADLESS = process.env.HEADLESS !== 'false'; // default: true (hidden)
const CHROME_PATH = process.env.CHROME_PATH || null;  // null = puppeteer uses bundled chromium

/**
 * Get or create the singleton browser instance.
 * IS_HEADLESS=true  → runs hidden (Docker/server)
 * HEADLESS=false    → shows Chrome window (local debugging)
 */
async function getBrowser() {
    if (browser) {
        try {
            await browser.pages();
        } catch (e) {
            browser = null;
        }
    }

    if (!browser) {
        if (!launchPromise) {
            console.log(`[Browser] Launching... (headless=${IS_HEADLESS})`);

            const launchArgs = [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--disable-popup-blocking',
            ];

            // Only minimize window when running visibly
            if (!IS_HEADLESS) launchArgs.push('--start-minimized');

            const launchOptions = {
                headless: IS_HEADLESS ? 'new' : false,  // 'new' = modern headless, avoids deprecation
                args: launchArgs,
            };

            // Use system Chrome if CHROME_PATH is set (local Windows), else puppeteer bundled
            if (CHROME_PATH) launchOptions.executablePath = CHROME_PATH;

            launchPromise = puppeteer.launch(launchOptions).then(b => {
                console.log('[Browser] Ready ✅');
                launchPromise = null;
                return b;
            }).catch(e => {
                launchPromise = null;
                throw e;
            });
        }
        browser = await launchPromise;
    }
    return browser;
}

async function closeBrowser() {
    if (browser) {
        await browser.close().catch(() => {});
        browser = null;
        console.log('[Browser] Closed.');
    }
}

// Common request handler: block ads + devtool scripts
function setupRequestInterception(page) {
    page.on('request', (req) => {
        const u = req.url();
        const type = req.resourceType();

        // Bypass devtool detector
        if (u.includes('disable-devtool')) {
            return req.respond({
                status: 200,
                contentType: 'application/javascript',
                body: 'window.DisableDevtool = function(){}; window.__disableDevtool = true;'
            });
        }
        // Block fordev redirect
        if (u.includes('fordev.jpg')) return req.abort();
        // Block ad networks
        if (u.includes('adstudio.cloud') || u.includes('adserver')) return req.abort();

        req.continue();
    });
}

module.exports = { getBrowser, closeBrowser, setupRequestInterception };
