import { SCREENSHOT_SELECTORS, SEED_PROJECT } from '@lightdash/common';
import { chromium, type Browser } from 'playwright';
import sharp from 'sharp';

/**
 * Opt-in browser regression against a running, seeded Lightdash instance.
 * The dashboard must contain one saved custom-chart tile. Set:
 * LIGHTDASH_HEADLESS_CAPTURE=1
 * LIGHTDASH_HEADLESS_BASE_URL=<URL reachable from Node and Chromium>
 * LIGHTDASH_HEADLESS_BROWSER_WS=<headless Chromium CDP WebSocket URL>
 * LIGHTDASH_HEADLESS_DASHBOARD_UUID=<dashboard with a custom-chart tile>
 * Optional: LIGHTDASH_HEADLESS_PROJECT_UUID, LIGHTDASH_HEADLESS_EMAIL,
 * LIGHTDASH_HEADLESS_PASSWORD (defaults are the local demo seed).
 * Run: pnpm -F backend exec vitest run src/services/UnfurlService/UnfurlService.headless.test.ts
 *
 * Only the iframe bundle is replaced: the dashboard, queries, renderer,
 * bridge and screenshot-ready indicator run through the real frontend.
 * SDK commit/RAF behavior is covered separately in vizContext.rendered.test.ts.
 */
describe.runIf(process.env.LIGHTDASH_HEADLESS_CAPTURE === '1')(
    'custom chart headless capture',
    () => {
        let browser: Browser;
        let baseUrl: string;
        let dashboardUuid: string;

        beforeAll(async () => {
            const url = process.env.LIGHTDASH_HEADLESS_BASE_URL;
            const endpoint = process.env.LIGHTDASH_HEADLESS_BROWSER_WS;
            const dashboard = process.env.LIGHTDASH_HEADLESS_DASHBOARD_UUID;
            if (!url || !endpoint || !dashboard) {
                throw new Error(
                    'Set the headless base URL, browser WebSocket and dashboard UUID',
                );
            }
            baseUrl = url;
            dashboardUuid = dashboard;
            browser = await chromium.connectOverCDP(endpoint);
        }, 30_000);

        afterAll(async () => {
            await browser?.close();
        });

        it.each([
            { name: 'modern SDK protocol', delayMs: 0, modern: true },
            { name: 'slow modern SDK protocol', delayMs: 2_000, modern: true },
            { name: 'legacy SDK fallback', delayMs: 2_000, modern: false },
        ])(
            'captures a painted chart with $name',
            async ({ delayMs, modern }) => {
                const context = await browser.newContext({
                    viewport: { width: 1400, height: 1000 },
                });
                try {
                    const login = await context.request.post(
                        new URL('/api/v1/login', baseUrl).toString(),
                        {
                            data: {
                                email:
                                    process.env.LIGHTDASH_HEADLESS_EMAIL ??
                                    'demo@lightdash.com',
                                password:
                                    process.env.LIGHTDASH_HEADLESS_PASSWORD ??
                                    'demo_password!', // pragma: allowlist secret (local seed)
                            },
                        },
                    );
                    expect(login.ok()).toBe(true);

                    await context.route(
                        '**/api/apps/**/versions/**/t/**',
                        (route) =>
                            route.fulfill({
                                contentType: 'text/html',
                                body: `<!doctype html><div id="chart">Loading chart…</div>
<script>
    let timer;
    const startedAt = performance.now();
    const announce = () => parent.postMessage({
        type: 'lightdash:sdk:manifest',
        sdkVersion: 'test',
        features: ${JSON.stringify(modern ? ['viz-rendered'] : [])},
    }, '*');
    addEventListener('message', ({ data }) => {
        if (data?.type === 'lightdash:sdk:ready') announce();
        if (data?.type !== 'lightdash:sdk:data-app-viz-context') return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            const chart = document.getElementById('chart');
            chart.textContent = 'Painted chart';
            chart.dataset.chartPainted = 'true';
            chart.dataset.startedAt = String(startedAt);
            chart.style.cssText = 'width:300px;height:200px;background:rgb(255,0,255)';
            if (${modern}) requestAnimationFrame(() => requestAnimationFrame(() => {
                parent.postMessage({ type: 'lightdash:sdk:viz-rendered', renderId: data.renderId }, '*');
            }));
        }, ${delayMs});
    });
    parent.postMessage({ type: 'lightdash:sdk:screenshot-available' }, '*');
    announce();
    parent.postMessage({ type: 'lightdash:sdk:viz-context-request' }, '*');
</script>`,
                            }),
                    );

                    const page = await context.newPage();
                    const projectUuid =
                        process.env.LIGHTDASH_HEADLESS_PROJECT_UUID ??
                        SEED_PROJECT.project_uuid;
                    await page.goto(
                        new URL(
                            `/minimal/projects/${projectUuid}/dashboards/${dashboardUuid}?context=scheduledDelivery`,
                            baseUrl,
                        ).toString(),
                    );
                    await page.waitForSelector(
                        SCREENSHOT_SELECTORS.READY_INDICATOR,
                        {
                            state: 'attached',
                            timeout: 45_000,
                        },
                    );
                    // Capture immediately, as UnfurlService does. Waiting for the
                    // paint marker here would hide the premature-ready regression.
                    const screenshot = await page.screenshot();
                    const frame = page
                        .frames()
                        .find((candidate) =>
                            candidate.url().includes('/api/apps/'),
                        );
                    expect(frame).toBeDefined();
                    const painted = await frame?.evaluate(() =>
                        Boolean(document.querySelector('[data-chart-painted]')),
                    );
                    expect(painted).toBe(true);

                    const { data, info } = await sharp(screenshot)
                        .removeAlpha()
                        .raw()
                        .toBuffer({ resolveWithObject: true });
                    let paintedPixels = 0;
                    for (let i = 0; i < data.length; i += info.channels) {
                        if (
                            data[i] === 255 &&
                            data[i + 1] === 0 &&
                            data[i + 2] === 255
                        ) {
                            paintedPixels += 1;
                        }
                    }
                    expect(paintedPixels).toBeGreaterThan(10_000);
                    if (!modern) {
                        const elapsed = await frame?.evaluate(() => {
                            const chart = document.querySelector<HTMLElement>(
                                '[data-chart-painted]',
                            );
                            return (
                                performance.now() -
                                Number(chart?.dataset.startedAt)
                            );
                        });
                        expect(elapsed).toBeGreaterThanOrEqual(8_000);
                    }
                } finally {
                    await context.close();
                }
            },
            60_000,
        );
    },
);
