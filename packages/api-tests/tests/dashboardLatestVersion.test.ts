import {
    Dashboard,
    DashboardBasicDetailsWithTileTypes,
    DashboardTileTypes,
    SEED_ORG_1_EDITOR,
    SEED_PROJECT,
    SEED_SPACE,
    Space,
    SpaceQuery,
    SpaceSummary,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginAsEditor } from '../helpers/auth';
import { uniqueName } from '../helpers/test-isolation';

const apiUrl = '/api/v1';
const projectUuid = SEED_PROJECT.project_uuid;
// Unfixed list queries are slow on projects with many dashboard versions.
const REQUEST_TIMEOUT = 30_000;

const chartTile = (savedChartUuid: string) => ({
    tabUuid: undefined,
    type: DashboardTileTypes.SAVED_CHART as const,
    x: 0,
    y: 0,
    h: 5,
    w: 5,
    properties: { savedChartUuid },
});

describe('Dashboard lists read the latest dashboard version', () => {
    let admin: ApiClient;
    let editor: ApiClient;
    let dashboardUuid: string;
    let spaceUuid: string;
    let chartX: string;
    let chartY: string;

    const listDashboards = async (chartUuid?: string) => {
        const query = chartUuid ? `?chartUuid=${chartUuid}` : '';
        const resp = await admin.get<
            Body<DashboardBasicDetailsWithTileTypes[]>
        >(`${apiUrl}/projects/${projectUuid}/dashboards${query}`);
        expect(resp.status).toBe(200);
        return resp.body.results.filter((d) => d.uuid === dashboardUuid);
    };

    beforeAll(async () => {
        admin = await login();
        editor = await loginAsEditor();

        const spaces = await admin.get<Body<SpaceSummary[]>>(
            `${apiUrl}/projects/${projectUuid}/spaces`,
        );
        const seedSpace = spaces.body.results.find(
            (s) => s.name === SEED_SPACE.name && !s.parentSpaceUuid,
        );
        expect(seedSpace).toBeDefined();
        spaceUuid = seedSpace!.uuid;

        // Seeded space charts only: names from uniqueName() belong to other test files.
        const charts = await admin.get<Body<SpaceQuery[]>>(
            `${apiUrl}/projects/${projectUuid}/charts`,
        );
        const seedCharts = charts.body.results.filter(
            (c) =>
                c.spaceUuid === seedSpace!.uuid &&
                !c.dashboardUuid &&
                !/ \[[0-9a-f]{8}\]$/.test(c.name),
        );
        expect(seedCharts.length).toBeGreaterThanOrEqual(2);
        [chartX, chartY] = [seedCharts[0].uuid, seedCharts[1].uuid];

        const created = await admin.post<Body<Dashboard>>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
            {
                name: uniqueName('Latest version dashboard'),
                spaceUuid: seedSpace!.uuid,
                tiles: [chartTile(chartX)],
                tabs: [],
            },
        );
        expect(created.status).toBe(201);
        dashboardUuid = created.body.results.uuid;

        const updated = await editor.patch<Body<Dashboard>>(
            `${apiUrl}/dashboards/${dashboardUuid}`,
            { tiles: [chartTile(chartY)], tabs: [] },
        );
        expect(updated.status).toBe(200);
    }, 60_000);

    afterAll(async () => {
        if (!dashboardUuid) return;
        await admin
            .delete(`${apiUrl}/dashboards/${dashboardUuid}`, {
                failOnStatusCode: false,
            })
            .catch(() => {});
    });

    it(
        'lists the dashboard under the chart in its latest version',
        async () => {
            const latest = await admin.get<Body<Dashboard>>(
                `${apiUrl}/dashboards/${dashboardUuid}`,
            );
            expect(latest.body.results.updatedByUser?.userUuid).toBe(
                SEED_ORG_1_EDITOR.user_uuid,
            );

            const matches = await listDashboards(chartY);
            expect(matches).toHaveLength(1);
            expect(matches[0].updatedByUser?.userUuid).toBe(
                SEED_ORG_1_EDITOR.user_uuid,
            );
            expect(matches[0].updatedAt).toBe(latest.body.results.updatedAt);
        },
        REQUEST_TIMEOUT,
    );

    it(
        'does not list the dashboard under a chart only in an older version',
        async () => {
            expect(await listDashboards(chartX)).toHaveLength(0);
        },
        REQUEST_TIMEOUT,
    );

    it(
        'lists the dashboard once in the project list, with its last updater',
        async () => {
            const matches = await listDashboards();
            expect(matches).toHaveLength(1);
            expect(matches[0].updatedByUser?.userUuid).toBe(
                SEED_ORG_1_EDITOR.user_uuid,
            );
        },
        REQUEST_TIMEOUT,
    );

    it(
        'lists the dashboard once in its space, with its latest version',
        async () => {
            const latest = await admin.get<Body<Dashboard>>(
                `${apiUrl}/dashboards/${dashboardUuid}`,
            );
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${projectUuid}/spaces/${spaceUuid}`,
            );
            expect(resp.status).toBe(200);
            const matches = resp.body.results.dashboards.filter(
                (d) => d.uuid === dashboardUuid,
            );
            expect(matches).toHaveLength(1);
            expect(matches[0].updatedByUser?.userUuid).toBe(
                SEED_ORG_1_EDITOR.user_uuid,
            );
            expect(matches[0].updatedAt).toBe(latest.body.results.updatedAt);
        },
        REQUEST_TIMEOUT,
    );

    it(
        'drops the dashboard from the project list once deleted',
        async () => {
            const deleted = await admin.delete(
                `${apiUrl}/dashboards/${dashboardUuid}`,
            );
            expect(deleted.status).toBe(200);
            expect(await listDashboards()).toHaveLength(0);
        },
        REQUEST_TIMEOUT,
    );
});
