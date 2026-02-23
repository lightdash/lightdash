/**
 * Playwright script to verify that table column widths remain stable
 * when scrolling through virtualized rows in the Explorer Results table.
 *
 * Usage:
 *   npx playwright test scripts/test-column-width-stability.ts
 *
 * Or run directly:
 *   npx tsx scripts/test-column-width-stability.ts
 *
 * Prerequisites:
 *   - Local dev server running (pnpm pm2:start)
 *   - Database seeded with dev data (./scripts/reset-db.sh)
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.EMAIL ?? 'demo@lightdash.com';
const PASSWORD = process.env.PASSWORD ?? 'demo_password!';

// Dimensions to query — produces a table with varied column widths
const DIMENSIONS = [
    'orders_order_id',
    'orders_customer_id',
    'orders_status',
    'orders_amount',
    'orders_fulfillment_center',
    'orders_order_source',
];

type ColumnWidths = Record<string, number>;

async function getColumnWidths(
    page: import('playwright').Page,
    tableIndex: number,
): Promise<ColumnWidths> {
    return page.evaluate((idx) => {
        const tables = document.querySelectorAll('table');
        const table = tables[idx];
        if (!table) throw new Error(`Table at index ${idx} not found`);
        const ths = table.querySelectorAll('thead th');
        const widths: Record<string, number> = {};
        ths.forEach((th) => {
            const name = (th as HTMLElement).textContent?.trim() ?? '';
            widths[name] = (th as HTMLElement).offsetWidth;
        });
        return widths;
    }, tableIndex);
}

async function scrollTable(
    page: import('playwright').Page,
    tableIndex: number,
    scrollTop: number,
): Promise<void> {
    await page.evaluate(
        ({ idx, top }) => {
            const tables = document.querySelectorAll('table');
            const table = tables[idx];
            if (!table) throw new Error(`Table at index ${idx} not found`);
            const container =
                table.closest('[class*="TableScrollableWrapper"]') ??
                table.parentElement;
            if (!container)
                throw new Error('No scrollable container found for table');
            container.scrollTop = top;
        },
        { idx: tableIndex, top: scrollTop },
    );
    // Wait for virtualizer to re-render
    await page.waitForTimeout(400);
}

function assertWidthsEqual(
    label: string,
    a: ColumnWidths,
    b: ColumnWidths,
): void {
    const keys = Object.keys(a);
    for (const key of keys) {
        if (a[key] !== b[key]) {
            throw new Error(
                `FAIL [${label}]: Column "${key}" width changed from ${a[key]}px to ${b[key]}px`,
            );
        }
    }
}

async function main() {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
    });
    const page = await context.newPage();

    try {
        // ── Step 1: Log in via API (bypasses multi-step UI) ──
        console.log('Logging in...');
        const loginResp = await page.request.post(`${BASE_URL}/api/v1/login`, {
            data: { email: EMAIL, password: PASSWORD },
        });
        if (!loginResp.ok()) {
            throw new Error(
                `Login failed: ${loginResp.status()} ${await loginResp.text()}`,
            );
        }
        // Navigate to home to confirm session
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
        console.log('  Logged in successfully.');

        // ── Step 2: Navigate to Explorer with Orders query ──
        console.log('Navigating to Explorer...');
        const queryConfig = {
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: DIMENSIONS,
                metrics: [],
                filters: {},
                sorts: [{ fieldId: 'orders_order_id', descending: false }],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [],
            },
            tableConfig: { columnOrder: DIMENSIONS },
            chartConfig: {
                type: 'table',
                config: {
                    showColumnCalculation: false,
                    showRowCalculation: false,
                    showTableNames: false,
                    showResultsTotal: false,
                    showSubtotals: false,
                    columns: {},
                    hideRowNumbers: false,
                    wrapColumnTitles: true,
                    conditionalFormattings: [],
                    metricsAsRows: false,
                },
            },
        };

        // Find the project UUID from the home page
        const projectUuid = await page.evaluate(() => {
            const match = window.location.href.match(/\/projects\/([^/]+)/);
            return match?.[1] ?? null;
        });

        // If not in a project URL yet, get it from the API
        let uuid = projectUuid;
        if (!uuid) {
            const resp = await page.evaluate(async () => {
                const r = await fetch('/api/v1/org/projects');
                const json = await r.json();
                return json.results?.[0]?.projectUuid ?? null;
            });
            uuid = resp;
        }

        if (!uuid) throw new Error('Could not determine project UUID');

        const explorerUrl = `${BASE_URL}/projects/${uuid}/tables/orders?create_saved_chart_version=${encodeURIComponent(JSON.stringify(queryConfig))}&isExploreFromHere=true`;
        await page.goto(explorerUrl, { waitUntil: 'networkidle' });

        // ── Step 3: Run query ──
        console.log('Running query (500 rows)...');
        const runButton = page.locator('button', {
            hasText: /Run query/,
        });
        await runButton.click();

        // Wait for the Results table to appear with data
        await page
            .locator('table')
            .nth(1)
            .waitFor({ state: 'visible', timeout: 30_000 });
        // Wait for rows to render
        await page.waitForTimeout(3000);

        console.log('  Query returned results.');

        // ── Step 4: Switch to Scroll mode ──
        console.log('Switching to Scroll mode...');
        const scrollLabel = page.locator('label', { hasText: 'Scroll' });
        await scrollLabel.click();
        await page.waitForTimeout(1000);
        console.log('  Scroll mode active.');

        // ── Step 5: Test column width stability ──
        // The Results table is the second <table> on the page (index 1).
        // The Chart table is index 0.
        const TABLE_INDEX = 1;

        console.log('\nTesting column width stability...');

        // Record widths at top
        const widthsAtTop = await getColumnWidths(page, TABLE_INDEX);
        console.log('  Widths at top:', widthsAtTop);

        // Scroll to middle (~row 250)
        await scrollTable(page, TABLE_INDEX, 7000);
        const widthsAtMiddle = await getColumnWidths(page, TABLE_INDEX);
        console.log('  Widths at middle:', widthsAtMiddle);

        // Scroll to bottom (~row 500)
        await scrollTable(page, TABLE_INDEX, 20000);
        const widthsAtBottom = await getColumnWidths(page, TABLE_INDEX);
        console.log('  Widths at bottom:', widthsAtBottom);

        // Scroll back to top
        await scrollTable(page, TABLE_INDEX, 0);
        const widthsBackAtTop = await getColumnWidths(page, TABLE_INDEX);
        console.log('  Widths back at top:', widthsBackAtTop);

        // ── Step 6: Assert stability ──
        console.log('\nVerifying...');
        assertWidthsEqual('top → middle', widthsAtTop, widthsAtMiddle);
        assertWidthsEqual('middle → bottom', widthsAtMiddle, widthsAtBottom);
        assertWidthsEqual(
            'bottom → back to top',
            widthsAtBottom,
            widthsBackAtTop,
        );

        // Also verify table-layout is fixed
        const tableLayout = await page.evaluate((idx) => {
            const tables = document.querySelectorAll('table');
            return getComputedStyle(tables[idx]).tableLayout;
        }, TABLE_INDEX);

        if (tableLayout !== 'fixed') {
            throw new Error(
                `FAIL: Expected table-layout: fixed, got: ${tableLayout}`,
            );
        }

        console.log('\n✓ All column widths stable across scroll positions');
        console.log(`✓ table-layout: ${tableLayout}`);
        console.log('\nPASS');
    } catch (err) {
        console.error('\n' + (err as Error).message);
        await page.screenshot({ path: 'column-width-failure.png' });
        console.error('Screenshot saved to column-width-failure.png');
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

main();
