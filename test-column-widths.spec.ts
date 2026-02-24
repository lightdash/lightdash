import { expect, test } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const CHART_URL = `${BASE_URL}/projects/3675b69e-8324-4110-bdca-059031aa8da3/saved/01b959e1-f3f8-4fc1-813f-ed6da8e3bce6/edit`;

const EMAIL = 'demo@lightdash.com';
const PASSWORD = 'demo_password!';

const WIDTH_TOLERANCE_PX = 1;

const TABLE_SCOPE = '[data-testid="visualization"]';

test.use({
    viewport: { width: 1920, height: 1080 },
});

async function ensureLoggedIn(page: import('@playwright/test').Page) {
    await page.goto(`${BASE_URL}/login`);

    try {
        const emailInput = page.getByPlaceholder('Your email address');
        await emailInput.waitFor({ state: 'visible', timeout: 5_000 });
        await emailInput.fill(EMAIL);
        await page.getByText('Continue').click();

        const passwordInput = page.getByPlaceholder('Your password');
        await passwordInput.waitFor({ state: 'visible', timeout: 5_000 });
        await passwordInput.fill(PASSWORD);
        await page.locator('[data-cy="signin-button"]').click();
        await page.waitForURL('**/home', { timeout: 15_000 });
    } catch {
        console.log(
            '\n⚠ Automated login failed — pausing for manual login.',
        );
        console.log('  Log in at the browser, then resume the test.\n');
        await page.pause();
    }
}

async function measureColumnWidths(
    page: import('@playwright/test').Page,
): Promise<number[]> {
    return page.evaluate((scope) => {
        const container = document.querySelector(scope);
        if (!container) throw new Error(`Container ${scope} not found`);
        const ths = container.querySelectorAll(
            'thead[data-testid="table-header"] th',
        );
        return Array.from(ths).map((th) => th.getBoundingClientRect().width);
    }, TABLE_SCOPE);
}

function printWidthTable(
    label: string,
    widths: number[],
    reference?: number[],
) {
    console.log(`\n=== ${label} ===`);
    console.log(
        widths
            .map((w, i) => {
                const diff =
                    reference !== undefined ? w - reference[i] : undefined;
                const diffStr =
                    diff !== undefined
                        ? ` (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}px)`
                        : '';
                return `  col ${i}: ${w.toFixed(1)}px${diffStr}`;
            })
            .join('\n'),
    );
}

test('Column widths remain stable during virtualized scroll', async ({
    page,
}) => {
    test.setTimeout(120_000);

    // --- Login ---
    await ensureLoggedIn(page);

    // --- Navigate to saved chart in edit mode ---
    await page.goto(CHART_URL);

    // --- Wait for the chart table to render ---
    const vizContainer = page.locator(TABLE_SCOPE);
    const tableHeader = vizContainer.locator(
        'thead[data-testid="table-header"]',
    );
    await tableHeader.waitFor({ state: 'visible', timeout: 60_000 });

    await vizContainer.locator('tbody tr td').first().waitFor({
        state: 'visible',
        timeout: 60_000,
    });

    // Give virtualizer time to settle
    await page.waitForTimeout(2_000);

    // --- Measurement 1: Initial column widths ---
    const initialWidths = await measureColumnWidths(page);
    printWidthTable('Initial widths', initialWidths);
    expect(initialWidths.length).toBeGreaterThan(0);

    // --- Find the scroll container ---
    await page.evaluate((scope) => {
        const container = document.querySelector(scope);
        if (!container) throw new Error(`Container ${scope} not found`);
        const table = container.querySelector('table');
        if (!table) throw new Error('No table found in container');

        let el: HTMLElement | null = table.parentElement;
        while (el) {
            const style = window.getComputedStyle(el);
            if (style.overflow === 'auto' || style.overflowY === 'auto') {
                el.setAttribute('data-test-scroll-container', 'true');
                return;
            }
            el = el.parentElement;
        }
        throw new Error(
            'No scroll container with overflow: auto found',
        );
    }, TABLE_SCOPE);

    const scrollContainer = page.locator(
        '[data-test-scroll-container="true"]',
    );

    // --- Scroll to bottom ---
    await scrollContainer.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(1_500);

    // --- Measurement 2: After scrolling to bottom ---
    const bottomWidths = await measureColumnWidths(page);
    printWidthTable('After scroll to bottom', bottomWidths, initialWidths);

    // --- Scroll back to top ---
    await scrollContainer.evaluate((el) => {
        el.scrollTop = 0;
    });
    await page.waitForTimeout(1_500);

    // --- Measurement 3: After scrolling back to top ---
    const topWidths = await measureColumnWidths(page);
    printWidthTable('After scroll back to top', topWidths, initialWidths);

    // --- Assert no column shrunk beyond tolerance ---
    for (let i = 0; i < initialWidths.length; i++) {
        const colLabel = `Column ${i}`;

        const bottomDiff = bottomWidths[i] - initialWidths[i];
        expect(
            bottomDiff,
            `${colLabel} shrunk by ${Math.abs(bottomDiff).toFixed(1)}px after scrolling to bottom (tolerance: ${WIDTH_TOLERANCE_PX}px)`,
        ).toBeGreaterThanOrEqual(-WIDTH_TOLERANCE_PX);

        const topDiff = topWidths[i] - initialWidths[i];
        expect(
            topDiff,
            `${colLabel} shrunk by ${Math.abs(topDiff).toFixed(1)}px after scrolling back to top (tolerance: ${WIDTH_TOLERANCE_PX}px)`,
        ).toBeGreaterThanOrEqual(-WIDTH_TOLERANCE_PX);
    }

    console.log('\n✓ All columns remained stable within tolerance');
});
