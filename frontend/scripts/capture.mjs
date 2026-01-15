import { chromium } from 'playwright';
import fs from 'fs/promises';

(async () => {
    const outDir = new URL('.', import.meta.url).pathname + '../scripts/';

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleLogs = [];
    const network = [];

    page.on('console', (msg) => {
        consoleLogs.push(`${new Date().toISOString()} [${msg.type()}] ${msg.text()}`);
    });

    page.on('request', (request) => {
        network.push({
            timestamp: new Date().toISOString(),
            type: 'request',
            url: request.url(),
            method: request.method(),
            resourceType: request.resourceType(),
        });
    });

    page.on('response', async (response) => {
        try {
            const req = response.request();
            network.push({
                timestamp: new Date().toISOString(),
                type: 'response',
                url: response.url(),
                status: response.status(),
                request: { url: req.url(), method: req.method() },
            });
        } catch (e) {
            // ignore
        }
    });

    // Navigate and wait for network to be mostly idle
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

    // Give the app a moment to settle
    await page.waitForTimeout(500);

    // Save screenshot and logs
    await fs.mkdir(new URL('.', import.meta.url).pathname + '../scripts/output', { recursive: true });
    const screenshotPath = new URL('.', import.meta.url).pathname + '../scripts/output/screenshot.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const consolePath = new URL('.', import.meta.url).pathname + '../scripts/output/console.log.txt';
    const networkPath = new URL('.', import.meta.url).pathname + '../scripts/output/network.json';

    await fs.writeFile(consolePath, consoleLogs.join('\n'));
    await fs.writeFile(networkPath, JSON.stringify(network, null, 2));

    await browser.close();
    console.log(`Saved screenshot to ${screenshotPath}`);
    console.log(`Saved console logs to ${consolePath}`);
    console.log(`Saved network log to ${networkPath}`);
})();
