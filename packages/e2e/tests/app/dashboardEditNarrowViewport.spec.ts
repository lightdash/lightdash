import {
    DashboardTileTypes,
    SEED_PROJECT,
    type ApiCreateDashboardResponse,
    type Dashboard,
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

// Narrower than the 1200px grid breakpoint, so the dashboard renders with 30 columns.
const NARROW_VIEWPORT = { width: 1150, height: 900 };

const markdownTile = (
    title: string,
    x: number,
    w: number,
    tabUuid: string | null,
) => ({
    uuid: crypto.randomUUID(),
    type: DashboardTileTypes.MARKDOWN as const,
    x,
    y: 0,
    w,
    h: 6,
    tabUuid,
    properties: { title, content: `${title} content` },
});

const createDashboard = async (
    api: TrackedApi,
    name: string,
    tabs: DashboardTab[],
) => {
    const tabUuid = tabs.at(0)?.uuid ?? null;
    const response = await api.post(
        `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        {
            data: {
                name,
                tiles: [
                    markdownTile('Left tile', 0, 18, tabUuid),
                    markdownTile('Right tile', 18, 18, tabUuid),
                ],
                tabs,
            },
        },
    );
    return json<ApiCreateDashboardResponse['results']>(response);
};

const tileSizes = (dashboard: Pick<Dashboard, 'tiles'>) =>
    dashboard.tiles.map(({ w, h }) => ({ w, h }));

const dragTileRight = async (page: Page, title: string, pixels: number) => {
    const tile = page
        .locator('.react-grid-item')
        .filter({ hasText: title })
        .first();
    const box = await tile.boundingBox();
    if (!box) throw new Error(`Tile "${title}" has no bounds`);
    const start = { x: box.x + box.width / 2, y: box.y + 12 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 5, start.y);
    await page.mouse.move(start.x + pixels, start.y, { steps: 10 });
    await page.mouse.up();
};

test.describe('Dashboard editing in a narrow viewport', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    const expectDragToKeepTileSizes = async (
        page: Page,
        api: TrackedApi,
        created: ApiCreateDashboardResponse['results'],
    ) => {
        const originalSizes = tileSizes(created);
        const grid = page.locator('.react-grid-layout');
        await expect(
            grid.getByText('Left tile', { exact: true }),
        ).toBeVisible();
        const gridWidth = await grid.evaluate((el) => el.clientWidth);
        expect(gridWidth).toBeLessThan(1200);

        const widthBeforeDrag = await grid
            .locator('.react-grid-item')
            .first()
            .evaluate((el) => el.getBoundingClientRect().width);

        await dragTileRight(page, 'Left tile', 40);

        const saved = page.waitForResponse(
            (res) =>
                res.request().method() === 'PATCH' &&
                res.url().includes(`/dashboards/${created.uuid}`),
        );
        await page.getByRole('button', { name: 'Save changes' }).click();
        await saved;

        const reloaded = await json<Dashboard>(
            await api.get(`/api/v1/dashboards/${created.uuid}`),
        );
        expect(tileSizes(reloaded)).toEqual(originalSizes);

        await expect
            .poll(() =>
                grid
                    .locator('.react-grid-item')
                    .first()
                    .evaluate((el) => el.getBoundingClientRect().width),
            )
            .toBeCloseTo(widthBeforeDrag, 0);
    };

    test('keeps tile sizes when a dashboard is opened straight into edit mode', async ({
        page,
        api,
    }) => {
        const created = await createDashboard(
            api,
            'Narrow viewport layout',
            [],
        );

        await page.setViewportSize(NARROW_VIEWPORT);
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${created.uuid}/edit`,
        );

        await expectDragToKeepTileSizes(page, api, created);
    });

    test('keeps tile sizes when a dashboard with tabs is edited', async ({
        page,
        api,
    }) => {
        const created = await createDashboard(
            api,
            'Narrow viewport layout with tabs',
            // A single tab renders as a dashboard without tabs
            [
                { uuid: crypto.randomUUID(), name: 'First tab', order: 0 },
                { uuid: crypto.randomUUID(), name: 'Second tab', order: 1 },
            ],
        );

        await page.setViewportSize(NARROW_VIEWPORT);
        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${created.uuid}/view`,
        );
        await page.getByLabel('Edit dashboard').click();

        await expectDragToKeepTileSizes(page, api, created);
    });
});
