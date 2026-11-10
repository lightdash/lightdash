import {
    DashboardTileTypes,
    getContentAsCodePathFromLtreePath,
    SEED_PROJECT,
    type ApiCreateComment,
    type ApiGetComments,
    type Dashboard,
    type DashboardAsCode,
    type DashboardAsCodeUpsertResult,
    type DashboardTileAsCode,
    type SavedChart,
    type Space,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiClient, type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { chartMock } from '../helpers/mocks';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const projectUuid = SEED_PROJECT.project_uuid;
const codeUrl = `/api/v1/projects/${projectUuid}/code/dashboards`;

describe('Dashboard tile comments through content-as-code uploads', () => {
    let admin: ApiClient;
    let spaceSlug: string;
    let chartSlugs: string[];
    const createdDashboardUuids = new Set<string>();
    const tracker = new TestResourceTracker();

    const upload = async (code: DashboardAsCode) => {
        const response = await admin.post<Body<DashboardAsCodeUpsertResult>>(
            `${codeUrl}/${code.slug}`,
            { ...code, force: true },
        );
        expect(response.status).toBe(200);
        const dashboard = response.body.results.dashboards[0].data;
        if (!createdDashboardUuids.has(dashboard.uuid)) {
            createdDashboardUuids.add(dashboard.uuid);
            tracker.trackDashboard(dashboard.uuid);
        }
        const chartTiles = dashboard.tiles.filter(
            (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
        );
        expect(chartTiles).toHaveLength(
            code.tiles.filter(
                (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
            ).length,
        );
        for (const tile of chartTiles) {
            expect(tile.properties.savedChartUuid).toEqual(expect.any(String));
        }
        return dashboard;
    };

    const download = async (slug: string) => {
        const response = await admin.get<
            Body<{ dashboards: DashboardAsCode[] }>
        >(`${codeUrl}?ids=${slug}`);
        expect(response.status).toBe(200);
        return response.body.results.dashboards[0];
    };

    const chart = (x = 0, chartSlug = chartSlugs[0]): DashboardTileAsCode => ({
        uuid: undefined,
        tileSlug: undefined,
        type: DashboardTileTypes.SAVED_CHART,
        x,
        y: 0,
        w: 6,
        h: 5,
        tabSlug: null,
        properties: { chartSlug, title: 'Chart' },
    });

    const create = (
        tiles: DashboardTileAsCode[],
        tabs: DashboardAsCode['tabs'] = [],
    ) =>
        upload({
            version: 1,
            spaceSlug,
            description: 'Tile comments regression',
            slug: `tile-comments-${randomUUID()}`,
            name: 'Tile comments regression',
            tiles,
            tabs,
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
            config: undefined,
        });

    const comment = async (
        dashboard: Pick<Dashboard, 'uuid'>,
        tileUuid: string,
        text: string,
        replyTo?: string,
    ) => {
        const response = await admin.post<ApiCreateComment>(
            `/api/v1/comments/dashboards/${dashboard.uuid}/${tileUuid}`,
            { text, textHtml: `<p>${text}</p>`, mentions: [], replyTo },
        );
        expect(response.status).toBe(200);
        return response.body.results;
    };

    const comments = async (
        dashboard: Pick<Dashboard, 'uuid'>,
        resolved = false,
    ) => {
        const response = await admin.get<ApiGetComments>(
            `/api/v1/comments/dashboards/${dashboard.uuid}?resolved=${resolved}`,
        );
        return response.body.results;
    };

    beforeAll(async () => {
        admin = await login();
        const spaceResponse = await admin.post<Body<Space>>(
            `/api/v1/projects/${projectUuid}/spaces`,
            {
                name: uniqueName('Tile comments'),
                inheritParentPermissions: true,
            },
        );
        expect(spaceResponse.status).toBe(200);
        const space = spaceResponse.body.results;
        tracker.trackSpace(space.uuid);
        spaceSlug = getContentAsCodePathFromLtreePath(space.path);
        chartSlugs = [];
        for (let i = 0; i < 2; i += 1) {
            const response = await admin.post<Body<SavedChart>>(
                `/api/v1/projects/${projectUuid}/saved`,
                {
                    ...chartMock,
                    name: uniqueName(`Tile comments chart ${i}`),
                    spaceUuid: space.uuid,
                    dashboardUuid: null,
                },
            );
            expect(response.status).toBe(200);
            const savedChart = response.body.results;
            tracker.trackChart(savedChart.uuid);
            const fetched = await admin.get<Body<SavedChart>>(
                `/api/v1/saved/${savedChart.uuid}`,
            );
            expect(fetched.status).toBe(200);
            expect(fetched.body.results).toMatchObject({
                uuid: savedChart.uuid,
                slug: savedChart.slug,
                spaceUuid: space.uuid,
                dashboardUuid: null,
            });
            expect(savedChart.slug).toEqual(expect.any(String));
            expect(savedChart.slug).not.toBe('');
            chartSlugs.push(savedChart.slug);
        }
        expect(chartSlugs.length).toBeGreaterThanOrEqual(2);
        expect(new Set(chartSlugs).size).toBe(2);
    });

    afterAll(async () => {
        await tracker.cleanup(admin);
    });

    it('keeps comments and replies over repeated uploads without exporting tile UUIDs', async () => {
        const dashboard = await create([
            chart(),
            {
                ...chart(6),
                type: DashboardTileTypes.MARKDOWN,
                properties: {
                    title: 'Notes',
                    content: 'Review this dashboard',
                },
            },
        ]);
        const tileUuid = dashboard.tiles[0].uuid;
        const parent = await comment(
            dashboard,
            tileUuid,
            'Keep this discussion',
        );
        const reply = await comment(
            dashboard,
            tileUuid,
            'Keep this reply',
            parent,
        );
        await comment(
            dashboard,
            dashboard.tiles[1].uuid,
            'Markdown discussion',
        );
        const before = await comments(dashboard);

        for (let i = 0; i < 3; i += 1) {
            const code = await download(dashboard.slug);
            expect(
                code.tiles.every(
                    (tile) =>
                        tile.uuid === undefined && tile.tabUuid === undefined,
                ),
            ).toBe(true);
            const updated = await upload(code);
            expect(updated.tiles.map((tile) => tile.uuid)).toEqual(
                dashboard.tiles.map((tile) => tile.uuid),
            );
            expect(await comments(updated)).toEqual(before);
        }
        expect(before[tileUuid][0]).toMatchObject({
            commentId: parent,
            replies: [expect.objectContaining({ commentId: reply })],
        });
    });

    it('keeps resolved state after an upload', async () => {
        const dashboard = await create([chart()]);
        const id = await comment(
            dashboard,
            dashboard.tiles[0].uuid,
            'Resolved discussion',
        );
        await admin.patch(
            `/api/v1/comments/dashboards/${dashboard.uuid}/${id}`,
            { resolved: true },
        );
        const before = await comments(dashboard, true);
        await upload(await download(dashboard.slug));
        expect(await comments(dashboard, true)).toEqual(before);
        expect(before[dashboard.tiles[0].uuid][0]).toMatchObject({
            commentId: id,
            resolved: true,
        });
    });

    it('keeps a unique chart discussion after moving, resizing and renaming the tile', async () => {
        const dashboard = await create([chart()]);
        await comment(
            dashboard,
            dashboard.tiles[0].uuid,
            'Unique chart discussion',
        );
        const before = await comments(dashboard);
        const code = await download(dashboard.slug);
        code.tiles[0] = {
            ...code.tiles[0],
            x: 6,
            y: 5,
            w: 12,
            h: 7,
            properties: { ...code.tiles[0].properties, title: 'Renamed' },
        } as DashboardTileAsCode;
        const updated = await upload(code);
        expect(updated.tiles[0].uuid).toBe(dashboard.tiles[0].uuid);
        expect(await comments(updated)).toEqual(before);
    });

    it('keeps duplicate discussions attached when YAML order changes', async () => {
        const dashboard = await create([chart(), chart(6)]);
        for (const tile of dashboard.tiles)
            await comment(dashboard, tile.uuid, `Discussion at ${tile.x}`);
        const before = await comments(dashboard);
        const code = await download(dashboard.slug);
        code.tiles.reverse();
        const updated = await upload(code);
        for (const tile of updated.tiles)
            expect(tile.uuid).toBe(
                dashboard.tiles.find((old) => old.x === tile.x)!.uuid,
            );
        expect(await comments(updated)).toEqual(before);
    });

    it('does not copy comments onto an added duplicate and keeps the surviving duplicate after removal', async () => {
        const dashboard = await create([chart()]);
        await comment(
            dashboard,
            dashboard.tiles[0].uuid,
            'Original discussion',
        );
        const before = await comments(dashboard);
        const code = await download(dashboard.slug);
        code.tiles.push(chart(6));
        const duplicated = await upload(code);
        const original = duplicated.tiles.find((tile) => tile.x === 0)!;
        const added = duplicated.tiles.find((tile) => tile.x === 6)!;
        expect(original.uuid).toBe(dashboard.tiles[0].uuid);
        expect(added.uuid).not.toBe(original.uuid);
        expect(await comments(duplicated)).toEqual(before);
        await comment(duplicated, added.uuid, 'Duplicate discussion');
        const withBoth = await comments(duplicated);
        const removeOriginal = await download(dashboard.slug);
        removeOriginal.tiles = removeOriginal.tiles.filter(
            (tile) => tile.x === 6,
        );
        const surviving = await upload(removeOriginal);
        expect(surviving.tiles[0].uuid).toBe(added.uuid);
        expect(await comments(surviving)).toEqual({
            [added.uuid]: withBoth[added.uuid],
        });
    });

    it('distinguishes duplicate charts with identical layouts on different tabs', async () => {
        const dashboard = await create(
            [
                { ...chart(), tabSlug: 'first' },
                { ...chart(), tabSlug: 'second' },
            ],
            [
                { slug: 'first', name: 'First', order: 0 },
                { slug: 'second', name: 'Second', order: 1 },
            ],
        );
        for (const tile of dashboard.tiles)
            await comment(
                dashboard,
                tile.uuid,
                `Discussion for ${tile.tabUuid}`,
            );
        const before = await comments(dashboard);
        const code = await download(dashboard.slug);
        code.tiles.reverse();
        const updated = await upload(code);
        for (const tile of updated.tiles)
            expect(tile.uuid).toBe(
                dashboard.tiles.find((old) => old.tabUuid === tile.tabUuid)!
                    .uuid,
            );
        expect(await comments(updated)).toEqual(before);
    });

    it('does not transfer discussion to a replacement chart or an ambiguous moved duplicate', async () => {
        const dashboard = await create([chart(), chart(6)]);
        for (const tile of dashboard.tiles)
            await comment(dashboard, tile.uuid, 'Existing discussion');
        const code = await download(dashboard.slug);
        code.tiles = [chart(12), chart(18)];
        const moved = await upload(code);
        expect(
            moved.tiles.every(
                (tile) =>
                    !dashboard.tiles.some((old) => old.uuid === tile.uuid),
            ),
        ).toBe(true);
        expect(await comments(moved)).toEqual({});
        await comment(moved, moved.tiles[0].uuid, 'New discussion');
        const replaced = await upload({
            ...code,
            tiles: [chart(12, chartSlugs[1])],
        });
        expect(await comments(replaced)).toEqual({});
    });

    it('does not carry comments or tile identities into a different dashboard', async () => {
        const original = await create([chart()]);
        await comment(
            original,
            original.tiles[0].uuid,
            'Original dashboard only',
        );
        const code = await download(original.slug);
        const copy = await upload({
            ...code,
            slug: `tile-comments-copy-${randomUUID()}`,
        });
        expect(copy.uuid).not.toBe(original.uuid);
        expect(copy.tiles[0].uuid).not.toBe(original.tiles[0].uuid);
        expect(await comments(copy)).toEqual({});
        expect(Object.keys(await comments(original))).toEqual([
            original.tiles[0].uuid,
        ]);
    });
});
