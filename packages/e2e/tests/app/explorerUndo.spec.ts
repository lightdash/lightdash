import { ChartSourceType, SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    expectNoSteps,
    expectUndoableStep,
    explorerSnapshot,
    json,
    loginAs,
    redoExplorer,
    runQuery,
    scrollTreeToItem,
    SEED_USERS,
    settledExplorer,
    test,
    undoExplorer,
    type Locator,
    type Page,
    type Request,
} from '../../support/test';

const projectUrl = `/projects/${SEED_PROJECT.project_uuid}`;

test.describe('Explorer undo and redo', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('undoes and redoes query and chart edits', async ({ page }) => {
        await page.goto(`${projectUrl}/tables/orders`);
        await expect(
            page.getByText('Dimensions', { exact: true }),
        ).toBeAttached();
        const undoButton = page.getByRole('button', { name: 'Undo' });
        const redoButton = page.getByRole('button', { name: 'Redo' });
        await expect(undoButton).toBeDisabled();
        const empty = await settledExplorer(page);
        expectNoSteps(empty, 'on load');

        // The default sort the first field seeds belongs to that field's step
        await (await scrollTreeToItem(page, 'Status')).click();
        const oneField = await settledExplorer(page);
        expect(oneField.past).toBe(1);
        await (await scrollTreeToItem(page, 'Average order amount')).click();
        const twoFields = await settledExplorer(page);
        expect(twoFields.past).toBe(2);

        expect((await undoExplorer(page)).chart).toBe(oneField.chart);
        await expect(redoButton).toBeEnabled();
        await redoButton.click();
        expect((await settledExplorer(page)).chart).toBe(twoFields.chart);

        // A chart type is one step, with the layout the chart derives for it
        await runQuery(page);
        await page.getByText('Chart', { exact: true }).click();
        await page
            .getByRole('button', { name: 'Configure', exact: true })
            .first()
            .click();
        await page
            .getByRole('button', { name: 'Bar chart', exact: true })
            .click();
        const bar = await settledExplorer(page);
        expect(bar.past).toBe(3);
        expect((await undoExplorer(page)).chart).toBe(twoFields.chart);
        expect((await redoExplorer(page)).chart).toBe(bar.chart);

        // Text being typed keeps the keys
        await page.getByPlaceholder('Search metrics + dimensions').click();
        await page.keyboard.press('ControlOrMeta+z');
        expect((await settledExplorer(page)).chart).toBe(bar.chart);

        // A modal over the chart keeps them too
        await page.getByRole('button', { name: 'Save chart' }).click();
        const saveModal = page.getByRole('dialog');
        await expect(saveModal).toBeVisible();
        await saveModal.getByRole('button', { name: 'Cancel' }).focus();
        await page.keyboard.press('ControlOrMeta+z');
        expect((await settledExplorer(page)).chart).toBe(bar.chart);
        await saveModal.getByRole('button', { name: 'Cancel' }).click();
        await expect(saveModal).toHaveCount(0);

        // A new edit after an undo drops what could be redone
        await undoExplorer(page);
        await (await scrollTreeToItem(page, 'Currency')).click();
        await settledExplorer(page);
        await expect(redoButton).toBeDisabled();
    });
});

/*
 * The sweep opens every seeded chart built on an explore and, for each one:
 *   - expects no undo step from loading it or from opening any config tab,
 *   - clicks every toggle in every config tab and checks the step undoes and redoes exactly,
 *   - changes the row limit and checks the query sent after undo equals the one sent before.
 * It takes a while, so it runs only when asked:
 *   E2E_UNDO_SWEEP=1 E2E_UNDO_SHARDS=4 pnpm -F e2e test tests/app/explorerUndo.spec.ts --workers=4
 */
const SWEEP_SHARDS = Number(process.env.E2E_UNDO_SHARDS ?? 1);
const CONTROLS_PER_TAB = Number(process.env.E2E_UNDO_CONTROLS ?? 12);
const CHART_FILTER = process.env.E2E_UNDO_CHARTS;

const GALLERY_CHART_TYPES = [
    'Bar chart',
    'Horizontal bar chart',
    'Line chart',
    'Area chart',
    'Scatter chart',
    'Pie chart',
    'Funnel chart',
    'Treemap',
    'Gauge',
    'Sankey',
    'Map',
    'Big value',
    'Table',
];

type ChartSummary = { uuid: string; name: string; source: ChartSourceType };
type ContentPage = {
    data: ChartSummary[];
    pagination?: { totalPageCount: number };
};

const metricQueryBodies = (page: Page) => {
    const bodies: unknown[] = [];
    page.on('request', (request: Request) => {
        if (
            request.method() === 'POST' &&
            request.url().includes('/query/metric-query')
        )
            bodies.push(request.postDataJSON());
    });
    return bodies;
};

// The parts of a metric query request that define what the warehouse is asked
const queryOf = (body: unknown) => {
    if (typeof body !== 'object' || body === null) return null;
    const { query, parameters, pivotConfiguration } = body as Record<
        string,
        unknown
    >;
    return JSON.stringify({ query, parameters, pivotConfiguration });
};

// Where two charts differ, as `path: before -> after`
const changedPaths = (a: unknown, b: unknown, path = ''): string[] => {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    const isObject = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null;
    if (!isObject(a) || !isObject(b))
        return [
            `${path}: ${JSON.stringify(a)?.slice(0, 80)} -> ${JSON.stringify(b)?.slice(0, 80)}`,
        ];
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .flatMap((key) => changedPaths(a[key], b[key], `${path}.${key}`))
        .slice(0, 8);
};

const runAndCaptureQuery = async (page: Page, bodies: unknown[]) => {
    const sent = bodies.length;
    await runQuery(page);
    await expect
        .poll(() => bodies.length, { message: 'a metric query is sent' })
        .toBeGreaterThan(sent);
    await settledExplorer(page);
    return queryOf(bodies.at(-1));
};

const closeAnyModal = async (page: Page) => {
    const modal = page.locator('[aria-modal="true"]');
    if ((await modal.count()) === 0) return false;
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    return true;
};

const openConfigTabs = async (page: Page) => {
    const tabs = page.getByRole('tab');
    if ((await tabs.count()) > 0) return tabs;
    await page
        .getByRole('button', { name: 'Configure', exact: true })
        .first()
        .click();
    const configureType = page.getByRole('button', { name: /^Configure \S/ });
    if ((await configureType.count()) > 0) await configureType.first().click();
    await page.waitForTimeout(500);
    return tabs;
};

// One toggle: null when it changed nothing, otherwise what went wrong undoing it
const sweepToggle = async (
    page: Page,
    label: string,
    toggle: Locator,
): Promise<string[] | null> => {
    if ((await toggle.count()) === 0 || (await toggle.isDisabled()))
        return null;
    const before = await settledExplorer(page);
    await toggle.evaluate((input: HTMLInputElement) => input.click());
    if (await closeAnyModal(page)) return null;
    const after = await settledExplorer(page);
    if (after.chart !== before.chart)
        return expectUndoableStep(page, label, before, after);
    return after.past === before.past
        ? null
        : [`${label}: a step was recorded for no change`];
};

const sweepToggles = async (page: Page, chartName: string, tab: string) => {
    const findings: string[] = [];
    const toggles = page
        .getByRole('tabpanel')
        .locator('input[type="checkbox"], input[type="radio"]');
    const count = Math.min(await toggles.count(), CONTROLS_PER_TAB);
    let exercised = 0;
    for (let index = 0; index < count; index += 1) {
        const result = await sweepToggle(
            page,
            `${chartName} > ${tab} > toggle ${index}`,
            toggles.nth(index),
        );
        if (result) {
            exercised += 1;
            findings.push(...result);
        }
    }
    return { findings, exercised };
};

// Every tab of the open config panel: opening it records nothing, every toggle undoes exactly
const sweepConfigTabs = async (
    page: Page,
    label: string,
    pastSteps: number,
) => {
    const findings: string[] = [];
    let exercised = 0;
    const tabNames = await (await openConfigTabs(page)).allInnerTexts();
    for (const tabName of tabNames) {
        await page.getByRole('tab', { name: tabName, exact: true }).click();
        const inTab = await settledExplorer(page);
        if (inTab.past !== pastSteps)
            findings.push(
                `${label} > ${tabName}: opening the tab recorded ${inTab.past - pastSteps} steps`,
            );
        const swept = await sweepToggles(page, label, tabName);
        findings.push(...swept.findings);
        exercised += swept.exercised;
    }
    return { findings, exercised, tabs: tabNames.length };
};

const sweepChart = async (page: Page, chart: ChartSummary) => {
    const findings: string[] = [];
    const bodies = metricQueryBodies(page);
    await page.goto(`${projectUrl}/saved/${chart.uuid}/edit`);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    const opened = await settledExplorer(page, { quietMs: 1500 });
    if (opened.past !== 0)
        findings.push(`${chart.name}: ${opened.past} steps recorded on load`);
    // The chart finishes deriving its config once results are in: that is the baseline
    const sentBefore = await runAndCaptureQuery(page, bodies);
    const loaded = await settledExplorer(page, { quietMs: 1500 });
    if (loaded.past !== 0)
        findings.push(
            `${chart.name}: ${loaded.past} steps recorded when results arrived`,
        );

    const swept = await sweepConfigTabs(page, chart.name, loaded.past);
    findings.push(...swept.findings);

    // What is sent after an undo must be exactly what was sent before the edit
    const before = await settledExplorer(page);
    await page.getByRole('button', { name: 'Query settings' }).click();
    const rowLimit = page
        .locator('.mantine-Popover-dropdown')
        .filter({ hasText: 'Row limit' })
        .locator('input[type="text"]')
        .first();
    await rowLimit.fill('7');
    await rowLimit.press('Enter');
    await page.keyboard.press('Escape');
    const limited = await settledExplorer(page);
    if (limited.chart === before.chart) {
        findings.push(`${chart.name}: the row limit did not change the chart`);
    } else {
        const sentLimited = await runAndCaptureQuery(page, bodies);
        if (sentLimited === sentBefore)
            findings.push(`${chart.name}: the row limit never reached a query`);
        findings.push(
            ...(await expectUndoableStep(
                page,
                `${chart.name} > row limit`,
                before,
                await settledExplorer(page),
            )),
        );
        const sentAfterUndo = await runAndCaptureQuery(page, bodies);
        if (sentAfterUndo !== sentBefore)
            findings.push(
                `${chart.name}: the query sent after undo differs from the one sent before the edit`,
            );
    }

    const final = await explorerSnapshot(page);
    if (final.chart !== loaded.chart)
        findings.push(
            `${chart.name}: the chart did not end where it loaded: ${changedPaths(JSON.parse(loaded.chart), JSON.parse(final.chart)).join('; ')}`,
        );
    return { findings, exercised: swept.exercised, tabs: swept.tabs };
};

test.describe('Explorer undo sweep', () => {
    test.skip(
        !process.env.E2E_UNDO_SWEEP,
        'Set E2E_UNDO_SWEEP=1 to sweep every seeded chart',
    );
    test.describe.configure({ mode: 'parallel' });

    test('every chart type in the gallery', async ({ page, api }) => {
        test.setTimeout(45 * 60_000);
        await loginAs(api.raw, SEED_USERS.admin);
        await page.goto(`${projectUrl}/tables/orders`);
        await expect(
            page.getByText('Dimensions', { exact: true }),
        ).toBeAttached();
        for (const field of [
            'Order source',
            'Shipping method',
            'Average order amount',
            'Average Shipping Cost',
        ])
            await (await scrollTreeToItem(page, field)).click();
        await runQuery(page);
        await page.getByText('Chart', { exact: true }).click();
        await page
            .getByRole('button', { name: 'Configure', exact: true })
            .first()
            .click();
        const gallery = page.getByRole('button', {
            name: /^(Change|Choose) chart type$/,
        });

        const findings: string[] = [];
        const summary: string[] = [];
        for (const chartType of GALLERY_CHART_TYPES) {
            await test.step(chartType, async () => {
                const typeButton = page.getByRole('button', {
                    name: chartType,
                    exact: true,
                });
                if ((await typeButton.count()) === 0)
                    await gallery.first().click();
                const before = await settledExplorer(page, { quietMs: 1500 });
                await typeButton.click();
                const after = await settledExplorer(page, { quietMs: 1500 });
                if (after.chart !== before.chart) {
                    findings.push(
                        ...(await expectUndoableStep(
                            page,
                            `switch to ${chartType}`,
                            before,
                            after,
                        )),
                    );
                    await typeButton.click();
                }
                const onType = await settledExplorer(page, { quietMs: 1500 });
                await page
                    .getByRole('button', { name: /^Configure \S/ })
                    .first()
                    .click();
                const swept = await sweepConfigTabs(
                    page,
                    chartType,
                    onType.past,
                );
                findings.push(...swept.findings);
                summary.push(
                    `${swept.findings.length === 0 ? 'ok  ' : 'FAIL'} ${chartType}: ${swept.tabs} tabs, ${swept.exercised} toggles`,
                );
            });
        }
        // eslint-disable-next-line no-console
        console.log([...summary, '', ...findings].join('\n'));
        expect(findings).toEqual([]);
    });

    for (let shard = 0; shard < SWEEP_SHARDS; shard += 1) {
        test(`every seeded chart, part ${shard + 1} of ${SWEEP_SHARDS}`, async ({
            page,
            api,
        }) => {
            test.setTimeout(60 * 60_000);
            await loginAs(api.raw, SEED_USERS.admin);

            const charts: ChartSummary[] = [];
            for (let pageNumber = 1; ; pageNumber += 1) {
                const content = await json<ContentPage>(
                    await api.get(
                        `/api/v2/content?contentTypes=chart&projectUuids=${SEED_PROJECT.project_uuid}&page=${pageNumber}&pageSize=100`,
                    ),
                );
                charts.push(...content.data);
                if (pageNumber >= (content.pagination?.totalPageCount ?? 1))
                    break;
            }
            const mine = charts
                .filter((chart) => chart.source === ChartSourceType.DBT_EXPLORE)
                .filter(
                    (chart) =>
                        !CHART_FILTER ||
                        chart.name
                            .toLowerCase()
                            .includes(CHART_FILTER.toLowerCase()),
                )
                .sort((a, b) => a.uuid.localeCompare(b.uuid))
                .filter((_chart, index) => index % SWEEP_SHARDS === shard);

            const findings: string[] = [];
            const summary: string[] = [];
            for (const chart of mine) {
                await test.step(chart.name, async () => {
                    try {
                        const result = await sweepChart(page, chart);
                        findings.push(...result.findings);
                        summary.push(
                            `${result.findings.length === 0 ? 'ok  ' : 'FAIL'} ${chart.name}: ${result.tabs} tabs, ${result.exercised} toggles`,
                        );
                    } catch (error) {
                        const reason =
                            error instanceof Error
                                ? error.message.split('\n')[0]
                                : String(error);
                        findings.push(`${chart.name}: sweep broke: ${reason}`);
                        summary.push(`ERR  ${chart.name}: ${reason}`);
                    }
                });
            }
            await test.info().attach('undo-sweep', {
                body: [...summary, '', ...findings].join('\n'),
                contentType: 'text/plain',
            });
            // eslint-disable-next-line no-console
            console.log([...summary, '', ...findings].join('\n'));
            expect(mine.length, 'charts swept').toBeGreaterThan(0);
            expect(findings).toEqual([]);
        });
    }
});
