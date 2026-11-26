import {
    DashboardTileTypes,
    FilterOperator,
    SEED_PROJECT,
    type ApiChartSummaryListResponse,
    type CreateDashboard,
    type DashboardFilterRule,
    type DashboardTab,
} from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    type Page,
    type TrackedApi,
} from '../../support/test';

const CHART_NAME = 'How much revenue do we have per payment method?';
const CHART_QUERY_URL =
    /\/api\/v2\/projects\/[^/]+\/query\/(dashboard-chart|dashboard-sql-chart)$/;

type TileSpec = {
    title: string;
    chart: boolean;
    x: number;
    y: number;
    tab: number | null;
};

const getChartUuid = async (api: TrackedApi) => {
    const charts = await json<ApiChartSummaryListResponse['results']>(
        await api.get(`/api/v1/projects/${SEED_PROJECT.project_uuid}/charts`),
    );
    const chart = charts.find(({ name }) => name === CHART_NAME);
    if (!chart) throw new Error(`Missing seed chart "${CHART_NAME}"`);
    return chart.uuid;
};

const createDashboard = async (
    api: TrackedApi,
    {
        name,
        tiles,
        tabNames = [],
        filters = () => [],
    }: {
        name: string;
        tiles: TileSpec[];
        tabNames?: string[];
        filters?: (tileUuids: string[]) => DashboardFilterRule[];
    },
) => {
    const chartUuid = await getChartUuid(api);
    const tabs: DashboardTab[] = tabNames.map((tabName, order) => ({
        uuid: crypto.randomUUID(),
        name: tabName,
        order,
    }));
    const tileUuids = tiles.map(() => crypto.randomUUID());
    const body: CreateDashboard = {
        name,
        tabs,
        tiles: tiles.map(({ title, chart, x, y, tab }, i) => {
            const base = {
                uuid: tileUuids[i],
                x,
                y,
                w: 12,
                h: 9,
                tabUuid: tab === null ? null : tabs[tab].uuid,
            };
            return chart
                ? {
                      ...base,
                      type: DashboardTileTypes.SAVED_CHART,
                      properties: { savedChartUuid: chartUuid, title },
                  }
                : {
                      ...base,
                      type: DashboardTileTypes.MARKDOWN,
                      properties: { title, content: `${title} content` },
                  };
        }),
        filters: {
            dimensions: filters(tileUuids),
            metrics: [],
            tableCalculations: [],
        },
    };
    const response = await api.post(
        `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        { data: body },
    );
    expect(response.status()).toBe(201);
    const { uuid } = await json<{ uuid: string }>(response);
    return { uuid, tileUuids };
};

// Records the tile of every chart query the page sends from now on
const recordChartQueries = (page: Page) => {
    const tileUuids: string[] = [];
    page.on('request', (request) => {
        if (
            request.method() !== 'POST' ||
            !CHART_QUERY_URL.test(new URL(request.url()).pathname)
        )
            return;
        const body: unknown = request.postDataJSON();
        tileUuids.push(
            body && typeof body === 'object' && 'tileUuid' in body
                ? String(body.tileUuid)
                : 'unknown',
        );
    });
    return tileUuids;
};

const tile = (page: Page, title: string) =>
    page.locator('.react-grid-item').filter({ hasText: title });

const openDashboard = async (page: Page, uuid: string, chartTiles: number) => {
    await page.goto(
        `/projects/${SEED_PROJECT.project_uuid}/dashboards/${uuid}/view`,
    );
    await expect(page.locator('.echarts-for-react')).toHaveCount(chartTiles);
};

const addMarkdownTile = async (page: Page, title: string) => {
    await page.getByRole('button', { name: 'Add tile' }).first().click();
    await page
        .getByRole('menuitem', { name: 'Markdown' })
        .click({ force: true });
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByText('Add', { exact: true }).click();
    await expect(tile(page, title)).toBeVisible();
};

// Resolves once the dashboard is refetched after Save, by when tiles have reacted to it
const saveDashboard = async (page: Page, uuid: string) => {
    const saved = page.waitForResponse(
        (res) =>
            res.request().method() === 'PATCH' &&
            res.url().includes(`/dashboards/${uuid}`),
    );
    const refetched = page.waitForResponse(
        (res) =>
            res.request().method() === 'GET' &&
            /\/dashboards\/[^/]+$/.test(new URL(res.url()).pathname),
    );
    await page.getByRole('button', { name: 'Save changes' }).click();
    expect((await saved).status()).toBe(200);
    expect((await refetched).status()).toBe(200);
    await expect(page.getByLabel('Edit dashboard')).toBeVisible();
};

test.describe('Dashboard save', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('a save without query changes runs no queries and keeps tiles mounted', async ({
        page,
        api,
    }) => {
        const { uuid } = await createDashboard(api, {
            name: 'Save without query changes',
            tiles: [
                { title: 'Chart A', chart: true, x: 0, y: 0, tab: null },
                { title: 'Chart B', chart: true, x: 12, y: 0, tab: null },
            ],
        });
        await openDashboard(page, uuid, 2);
        const queries = recordChartQueries(page);

        await page.getByLabel('Edit dashboard').click();
        await addMarkdownTile(page, 'Notes');

        // Entering edit remounts tiles, so hold them from just before Save
        const charts = await Promise.all(
            ['Chart A', 'Chart B'].map((title) =>
                tile(page, title).locator('.echarts-for-react').elementHandle(),
            ),
        );
        // Flags any frame where the page spinner replaces the dashboard
        await page.evaluate(() => {
            const w = window as Window & { pageSpinnerSeen?: boolean };
            w.pageSpinnerSeen = false;
            new MutationObserver(() => {
                if (document.querySelector('[data-testid="page-spinner"]'))
                    w.pageSpinnerSeen = true;
            }).observe(document.body, { childList: true, subtree: true });
        });

        await saveDashboard(page, uuid);
        await expect(tile(page, 'Notes')).toBeVisible();
        await expect(page.locator('.echarts-for-react')).toHaveCount(2);

        expect(queries).toEqual([]);
        for (const chart of charts) {
            expect(await chart?.evaluate((el) => el.isConnected)).toBe(true);
        }
        expect(
            await page.evaluate(
                () =>
                    (window as Window & { pageSpinnerSeen?: boolean })
                        .pageSpinnerSeen,
            ),
        ).toBe(false);
    });

    test('a filter change re-runs only the tiles it targets', async ({
        page,
        api,
    }) => {
        const { uuid, tileUuids } = await createDashboard(api, {
            name: 'Save with a filter change',
            tiles: [
                { title: 'Targeted', chart: true, x: 0, y: 0, tab: null },
                { title: 'Excluded', chart: true, x: 12, y: 0, tab: null },
            ],
            filters: ([, excluded]) => [
                {
                    id: crypto.randomUUID(),
                    label: 'Payment method',
                    target: {
                        fieldId: 'payments_payment_method',
                        tableName: 'payments',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [],
                    disabled: true,
                    tileTargets: { [excluded]: false },
                },
            ],
        });
        await openDashboard(page, uuid, 2);
        const queries = recordChartQueries(page);

        await page.getByLabel('Edit dashboard').click();
        await page
            .locator('button[data-dashboard-filter-control]', {
                hasText: 'Payment method',
            })
            .click();
        await page
            .getByRole('switch', { name: 'Provide default value' })
            .click({
                force: true,
            });
        await page
            .getByPlaceholder('Start typing to filter results')
            .fill('credit_card');
        await page
            .getByRole('option', { name: 'credit_card', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Apply' })
            .click({ force: true });
        // Save waits for the rows, else the tile rightly runs once more
        const targeted = tile(page, 'Targeted');
        await expect(targeted.getByText('bank_transfer')).toBeHidden();
        await expect(targeted.getByText('credit_card')).toBeVisible();
        await expect(
            tile(page, 'Excluded').getByText('bank_transfer'),
        ).toBeVisible();
        expect(queries).toEqual([tileUuids[0]]);

        await saveDashboard(page, uuid);
        await expect(page.locator('.echarts-for-react')).toHaveCount(2);
        await expect(
            page.getByText('Loading chart', { exact: true }),
        ).toHaveCount(0);
        expect(queries).toEqual([tileUuids[0]]);
    });

    for (const { layout, tabNames, tab } of [
        { layout: 'a single grid', tabNames: [], tab: null },
        {
            layout: "a dashboard's second tab",
            tabNames: ['One', 'Two'],
            tab: 1,
        },
    ]) {
        test(`tiles keep their place on Save on ${layout}`, async ({
            page,
            api,
        }) => {
            const titles = ['Left chart', 'Right chart', 'Below'];
            const { uuid } = await createDashboard(api, {
                name: `Save layout on ${layout}`,
                tabNames,
                tiles: [
                    { title: titles[0], chart: true, x: 0, y: 0, tab },
                    { title: titles[1], chart: true, x: 12, y: 0, tab },
                    { title: titles[2], chart: false, x: 0, y: 9, tab },
                ],
            });
            await page.goto(
                `/projects/${SEED_PROJECT.project_uuid}/dashboards/${uuid}/view`,
            );
            if (tab !== null) {
                await page.getByRole('tab', { name: tabNames[tab] }).click();
            }
            await expect(page.locator('.echarts-for-react')).toHaveCount(2);

            await page.getByLabel('Edit dashboard').click();
            await addMarkdownTile(page, 'Notes');

            // Samples tile boxes, relative to the grid, every frame through Save
            await page.evaluate((tileTitles) => {
                const w = window as Window & {
                    tileBoxes?: (string | null)[][];
                    stopSampling?: boolean;
                };
                w.tileBoxes = [];
                w.stopSampling = false;
                const sample = () => {
                    const items = Array.from(
                        document.querySelectorAll('.react-grid-item'),
                    );
                    w.tileBoxes?.push(
                        tileTitles.map((title) => {
                            const item = items.find((el) =>
                                el.textContent?.includes(title),
                            );
                            const gridBox = item
                                ?.closest('.react-grid-layout')
                                ?.getBoundingClientRect();
                            if (!item || !gridBox) return null;
                            const box = item.getBoundingClientRect();
                            return [
                                box.x - gridBox.x,
                                box.y - gridBox.y,
                                box.width,
                                box.height,
                            ]
                                .map(Math.round)
                                .join(',');
                        }),
                    );
                    if (!w.stopSampling) requestAnimationFrame(sample);
                };
                sample();
            }, titles);

            await saveDashboard(page, uuid);
            await expect(page.locator('.echarts-for-react')).toHaveCount(2);
            await expect(
                page.getByText('Loading chart', { exact: true }),
            ).toHaveCount(0);

            const boxes = await page.evaluate(() => {
                const w = window as Window & {
                    tileBoxes?: (string | null)[][];
                    stopSampling?: boolean;
                };
                w.stopSampling = true;
                return w.tileBoxes ?? [];
            });
            const distinct = [...new Set(boxes.map((b) => JSON.stringify(b)))];
            expect(distinct).toEqual([JSON.stringify(boxes[0])]);
        });
    }
});
