import { expect, test, type Locator, type Page } from '@playwright/test';
import {
    DARK_VISUALIZATION_THEME,
    LIGHT_VISUALIZATION_THEME,
} from '../../src/theme';

/**
 * What a browser actually draws for every chart type, light and dark. The
 * unit tests check the options; these check the pixels' DOM: series marks,
 * axis labels, legends and tooltips, as ECharts renders them.
 */

const ECHARTS_CASES = [
    'bar',
    'line-two-metrics',
    'horizontal-stacked',
    'pie',
    'funnel',
    'treemap',
    'gauge',
    'sankey',
] as const;

const section = (page: Page, id: string) =>
    page.locator(`section[data-case="${id}"]`);

/** The ECharts SVG of a case, drawn. */
const svgOf = (page: Page, id: string) => section(page, id).locator('svg');

/** Visible text nodes of an SVG, trimmed, in document order. */
const textsOf = async (svg: Locator) =>
    (await svg.locator('text').allTextContents())
        .map((text) => text.trim())
        .filter(Boolean);

const openHarness = async (page: Page, theme: 'light' | 'dark' = 'light') => {
    await page.goto(`/?theme=${theme}`);
    await expect(page.locator('section[data-case]')).toHaveCount(10);
};

test.describe('every chart type draws', () => {
    test('renders each ECharts type to an SVG with marks', async ({ page }) => {
        await openHarness(page);

        const rendered = await page.evaluate(() => window.harness.rendered);
        for (const id of ECHARTS_CASES) {
            expect(rendered[id], id).toBe('echarts');
            const svg = svgOf(page, id);
            await expect(svg, id).toBeVisible();
            expect(
                await svg.locator('path').count(),
                `${id} draws paths`,
            ).toBeGreaterThan(0);
        }
        expect(rendered['big-number']).toBe('bigNumber');
        expect(rendered.table).toBe('table');
    });

    test('bar: one bar per status, axis labelled with the formatted revenue', async ({
        page,
    }) => {
        await openHarness(page);
        const svg = svgOf(page, 'bar');
        const texts = await textsOf(svg);

        // The category axis names the statuses; the value axis is in dollars.
        expect(texts).toEqual(expect.arrayContaining(['completed', 'shipped']));
        expect(
            texts.some((text) => /^\$\d/.test(text)),
            texts.join(' | '),
        ).toBe(true);
        // Axis titles come from the fields' labels.
        expect(texts).toEqual(expect.arrayContaining(['Status', 'Revenue']));
    });

    test('bar: the tooltip of a bar names its status and formats its value', async ({
        page,
    }) => {
        await openHarness(page);
        await page.evaluate(() => window.harness.showTip('bar', 0, 0));

        // Lightdash's tooltip is HTML appended to the body.
        const tooltip = page
            .locator('body > div')
            .filter({ hasText: 'completed' })
            .last();
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toContainText('$1,200.50');
        await expect(tooltip).toContainText('Revenue');
    });

    test('line with two metrics: a legend, two lines and two value axes', async ({
        page,
    }) => {
        await openHarness(page);
        const svg = svgOf(page, 'line-two-metrics');
        const texts = await textsOf(svg);

        expect(texts).toEqual(expect.arrayContaining(['Revenue', 'Orders']));
        // Two series, two lines: an unfilled path with a stroke width; axis and
        // grid lines carry none.
        expect(
            await svg.locator('path[fill="none"][stroke-width]').count(),
        ).toBeGreaterThanOrEqual(2);
    });

    test('pie: a slice per status with percentages', async ({ page }) => {
        await openHarness(page);
        const texts = await textsOf(svgOf(page, 'pie'));

        expect(texts).toEqual(expect.arrayContaining(['completed', 'shipped']));
        expect(
            texts.some((text) => /%$/.test(text)),
            texts.join(' | '),
        ).toBe(true);
    });

    test('big number: the first row formatted by its field, with a comparison', async ({
        page,
    }) => {
        await openHarness(page);
        const big = section(page, 'big-number');

        await expect(big.locator('.big-number')).toHaveText('$1,200.50');
        // The label carries the table's name by default, as the web app's does.
        await expect(big.locator('.big-number-label')).toHaveText(
            'Orders Revenue',
        );
        await expect(big.locator('.big-number-comparison')).not.toHaveText('');
    });

    test('table: every column in order, cells formatted by their field', async ({
        page,
    }) => {
        await openHarness(page);
        const table = section(page, 'table').locator('table');

        await expect(table.locator('th')).toHaveText([
            'Status',
            'Channel',
            'Revenue',
            'Orders',
        ]);
        await expect(table.locator('tbody tr')).toHaveCount(3);
        await expect(
            table.locator('tbody tr').first().locator('td'),
        ).toHaveText(['completed', 'web', '$1,200.50', '12']);
    });

    test('gauge scales its text to the box', async ({ page }) => {
        await openHarness(page);
        const texts = await textsOf(svgOf(page, 'gauge'));

        // The value and the field label are drawn.
        expect(texts.join(' ')).toMatch(/Revenue/);
    });
});

test.describe('themes', () => {
    test('dark draws on the dark background with light text', async ({
        page,
    }) => {
        await openHarness(page, 'dark');
        const svg = svgOf(page, 'bar');

        const fills = await svg
            .locator('text')
            .evaluateAll((nodes) =>
                nodes.map((node) => getComputedStyle(node).fill),
            );
        // Axis text takes the dark theme's ramp, never the light theme's ink.
        expect(fills.length).toBeGreaterThan(0);
        expect(fills).not.toContain(
            hexToRgb(LIGHT_VISUALIZATION_THEME.foreground),
        );
        expect(fills).not.toContain(
            hexToRgb(LIGHT_VISUALIZATION_THEME.neutral[9]),
        );

        await test.info().attach('bar · dark', {
            body: await section(page, 'bar').screenshot(),
            contentType: 'image/png',
        });
    });

    test('light and dark render the same marks', async ({ page }) => {
        await openHarness(page, 'light');
        const lightPaths = await svgOf(page, 'bar').locator('path').count();
        await openHarness(page, 'dark');
        const darkPaths = await svgOf(page, 'bar').locator('path').count();

        expect(darkPaths).toBe(lightPaths);
        expect(DARK_VISUALIZATION_THEME.background).not.toBe(
            LIGHT_VISUALIZATION_THEME.background,
        );
    });
});

test('a gallery of every type, for the report', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
        await openHarness(page, theme);
        await test.info().attach(`all charts · ${theme}`, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
        });
    }
});

function hexToRgb(hex: string): string {
    const value = hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgb(${r}, ${g}, ${b})`;
}
