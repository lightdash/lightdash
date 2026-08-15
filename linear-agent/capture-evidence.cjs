const fs = require('node:fs/promises');
const path = require('node:path');

const [baseUrl, cdpUrl, planPath, outputDir, resultPath, unavailableReason] =
    process.argv.slice(2);

if (![baseUrl, cdpUrl, planPath, outputDir, resultPath].every(Boolean)) {
    throw new Error('Expected base URL, CDP URL, plan path, output directory, and result path');
}

const boundedRepeat = (value) => Math.max(1, Math.min(Number(value) || 1, 10));
const boundedDelay = (value) => Math.max(0, Math.min(Number(value) || 0, 5000));

function plannedEvidence(screenshot, index) {
    const relativePath = String(screenshot.path || '/');
    const name = String(screenshot.name || `screenshot-${index + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || `screenshot-${index + 1}`;
    return {
        name,
        description: String(screenshot.description || name).slice(0, 300),
        relativeUrl:
            relativePath.startsWith('/') && !relativePath.startsWith('//')
                ? relativePath
                : '',
        steps: (Array.isArray(screenshot.steps) ? screenshot.steps : [])
            .map((step) => String(step).replace(/\s+/g, ' ').trim().slice(0, 300))
            .filter(Boolean)
            .slice(0, 10),
    };
}

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
    if (unavailableReason) throw new Error(unavailableReason);

    await fs.mkdir(outputDir, { recursive: true });
    const { chromium } = require('playwright');
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0] || await browser.newContext();
    const evidence = [];
    const errors = [];

    try {
        for (let index = 0; index < screenshots.length; index += 1) {
            const screenshot = screenshots[index];
            const relativePath = String(screenshot.path || '/');
            const planned = plannedEvidence(screenshot, index);
            if (!relativePath.startsWith('/') || relativePath.startsWith('//')) {
                const error = `Screenshot ${index + 1} has an unsafe path`;
                errors.push(error);
                evidence.push({ ...planned, error });
                continue;
            }
            const { name } = planned;
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
                const capturedUrl = new URL(page.url());
                evidence.push({
                    ...planned,
                    relativeUrl: `${capturedUrl.pathname}${capturedUrl.search}${capturedUrl.hash}`,
                    file: outputPath,
                    mimeType: 'image/jpeg',
                });
            } catch (error) {
                const message = `${name}: ${error.message}`;
                errors.push(message);
                evidence.push({ ...planned, error: message });
            } finally {
                await page.close().catch((error) => {
                    errors.push(`${name}: page cleanup failed: ${error.message}`);
                });
            }
        }
    } finally {
        await browser.close().catch((error) => {
            errors.push(`Browser cleanup failed: ${error.message}`);
        });
    }

    await fs.writeFile(resultPath, `${JSON.stringify({ evidence, errors })}\n`);
    if (!evidence.some((item) => item.file)) process.exitCode = 1;
}

main().catch(async (error) => {
    try {
        const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
        const screenshots = Array.isArray(plan.screenshots) ? plan.screenshots.slice(0, 3) : [];
        const message = `Image capture failed: ${error.message}`;
        const evidence = screenshots.map((screenshot, index) => ({
            ...plannedEvidence(screenshot, index),
            error: message,
        }));
        await fs.writeFile(
            resultPath,
            `${JSON.stringify({ evidence, errors: [message] })}\n`,
        );
    } catch (writeError) {
        process.stderr.write(`Could not preserve evidence details: ${writeError.message}\n`);
    }
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
