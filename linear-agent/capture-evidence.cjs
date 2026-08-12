const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const [baseUrl, cdpUrl, planPath, outputDir, resultPath] = process.argv.slice(2);

if (![baseUrl, cdpUrl, planPath, outputDir, resultPath].every(Boolean)) {
    throw new Error('Expected base URL, CDP URL, plan path, output directory, and result path');
}

const boundedRepeat = (value) => Math.max(1, Math.min(Number(value) || 1, 10));
const boundedDelay = (value) => Math.max(0, Math.min(Number(value) || 0, 5000));

async function performAction(page, action) {
    const selector = String(action.selector || '');
    for (let index = 0; index < boundedRepeat(action.repeat); index += 1) {
        switch (action.type) {
            case 'fill':
                await page.locator(selector).fill(String(action.value || ''));
                break;
            case 'click':
                await page.locator(selector).click({ force: action.force === true });
                break;
            case 'press':
                await page.locator(selector).press(String(action.key || 'Enter'));
                break;
            case 'check':
                await page.locator(selector).check();
                break;
            case 'uncheck':
                await page.locator(selector).uncheck();
                break;
            case 'select':
                await page.locator(selector).selectOption(action.value);
                break;
            case 'waitFor':
                await page.locator(selector).first().waitFor({
                    state: action.state || 'visible',
                    timeout: 15000,
                });
                break;
            case 'assertText': {
                const value = String(action.value || '');
                const locator = selector
                    ? page.locator(selector).filter({ hasText: value })
                    : page.getByText(value, { exact: false });
                await locator.first().waitFor({ state: 'visible', timeout: 15000 });
                break;
            }
            case 'wait':
                await page.waitForTimeout(boundedDelay(action.milliseconds));
                break;
            default:
                throw new Error(`Unsupported evidence action: ${action.type}`);
        }
        if (action.waitAfterMs) {
            await page.waitForTimeout(boundedDelay(action.waitAfterMs));
        }
    }
}

async function authenticate(page) {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    const login = await page.evaluate(async () => {
        const response = await fetch('/api/v1/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                email: 'demo@lightdash.com',
                password: 'demo_password!',
            }),
        });
        return { ok: response.ok, status: response.status };
    });
    if (!login.ok) throw new Error(`Preview login failed with HTTP ${login.status}`);
}

async function main() {
    const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
    const screenshots = Array.isArray(plan.screenshots) ? plan.screenshots.slice(0, 3) : [];
    if (!screenshots.length) throw new Error('Evidence plan contains no screenshots');

    await fs.mkdir(outputDir, { recursive: true });
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0] || await browser.newContext();
    const evidence = [];
    const errors = [];

    try {
        for (let index = 0; index < screenshots.length; index += 1) {
            const screenshot = screenshots[index];
            const relativePath = String(screenshot.path || '/');
            if (!relativePath.startsWith('/') || relativePath.startsWith('//')) {
                errors.push(`Screenshot ${index + 1} has an unsafe path`);
                continue;
            }
            const name = String(screenshot.name || `screenshot-${index + 1}`)
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 60) || `screenshot-${index + 1}`;
            const outputPath = path.join(outputDir, `${name}.jpg`);
            const page = await context.newPage();
            await page.setViewportSize({ width: 1440, height: 1000 });
            try {
                await context.clearCookies();
                if (screenshot.authenticated !== false) await authenticate(page);
                await page.goto(`${baseUrl}${relativePath}`, { waitUntil: 'domcontentloaded' });
                for (const action of screenshot.actions || []) {
                    await performAction(page, action);
                }
                await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
                await page.screenshot({
                    path: outputPath,
                    type: 'jpeg',
                    quality: 82,
                    fullPage: screenshot.fullPage === true,
                    animations: 'disabled',
                });
                evidence.push({
                    name,
                    description: String(screenshot.description || name).slice(0, 300),
                    file: outputPath,
                    mimeType: 'image/jpeg',
                });
            } catch (error) {
                errors.push(`${name}: ${error.message}`);
            } finally {
                await page.close();
            }
        }
    } finally {
        await browser.close();
    }

    await fs.writeFile(resultPath, `${JSON.stringify({ evidence, errors })}\n`);
    if (!evidence.length) process.exitCode = 1;
}

main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
