import {
    isDashboardChartTileType,
    SchedulerFormat,
    SEED_COMPOSER_CHART,
    SEED_COMPOSER_CHART_DASHBOARD,
    SEED_PROJECT,
    type Dashboard,
} from '@lightdash/common';
import { beforeAll, describe, expect, it } from 'vitest';
import { ApiClient, Body } from '../helpers/api-client';
import { login, loginAsViewer } from '../helpers/auth';

// A composer chart row lives in a dashboard; every classic surface that
// reads it as a semantic chart refuses it by name, before any write.
const projectUuid = SEED_PROJECT.project_uuid;

type ApiErrorBody = { error: { name: string; message: string } };

describe('Composer chart rows on classic surfaces', () => {
    let admin: ApiClient;
    let viewer: ApiClient;
    let dashboardUuid: string;
    let composerChartUuid: string;

    beforeAll(async () => {
        admin = await login();
        viewer = await loginAsViewer();

        const dashboard = await admin.get<Body<Dashboard>>(
            `/api/v1/dashboards/${SEED_COMPOSER_CHART_DASHBOARD.slug}?projectUuid=${projectUuid}`,
        );
        expect(dashboard.status).toBe(200);
        dashboardUuid = dashboard.body.results.uuid;
        const tile = dashboard.body.results.tiles.find(
            (candidate) =>
                isDashboardChartTileType(candidate) &&
                candidate.properties.chartName ===
                    SEED_COMPOSER_CHART.revenueShare,
        );
        if (!tile || !isDashboardChartTileType(tile)) {
            throw new Error(
                `No tile for "${SEED_COMPOSER_CHART.revenueShare}"`,
            );
        }
        composerChartUuid = tile.properties.savedChartUuid!;
    });

    it.each([
        ['results', () => ({})],
        [
            'chart-and-results',
            () => ({ dashboardSorts: [], dashboardFilters: {}, dashboardUuid }),
        ],
        ['calculate-total', () => ({})],
    ])(
        'the classic-only route %s refuses the chart by name',
        async (route, body) => {
            const resp = await viewer.post<ApiErrorBody>(
                `/api/v1/saved/${composerChartUuid}/${route}`,
                body(),
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(400);
            expect(resp.body.error.name).toBe('ComposerChartNotSupportedError');
        },
    );

    it('the classic GET route refuses the chart by name', async () => {
        const resp = await viewer.get<ApiErrorBody>(
            `/api/v2/projects/${projectUuid}/saved/${composerChartUuid}`,
            { failOnStatusCode: false },
        );
        expect(resp.status).toBe(400);
        expect(resp.body.error.name).toBe('ComposerChartNotSupportedError');
    });

    describe('surfaces a composer chart does not have yet are refused before any write', () => {
        it('a scheduled delivery on the chart', async () => {
            const resp = await admin.post<ApiErrorBody>(
                `/api/v1/saved/${composerChartUuid}/schedulers`,
                {
                    name: 'Weekly revenue share',
                    cron: '0 9 * * 1',
                    timezone: 'UTC',
                    format: SchedulerFormat.CSV,
                    options: {},
                    targets: [{ recipient: 'viewer@lightdash.com' }],
                    appUuid: null,
                    appName: null,
                    enabled: true,
                    includeLinks: true,
                },
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(400);
            expect(resp.body.error.name).toBe('ComposerChartNotSupportedError');

            const schedulers = await admin.get<Body<unknown[]>>(
                `/api/v1/saved/${composerChartUuid}/schedulers`,
            );
            expect(schedulers.body.results).toEqual([]);
        });

        it('moving the chart out of its dashboard into a space', async () => {
            const spaces = await admin.get<Body<{ uuid: string }[]>>(
                `/api/v1/projects/${projectUuid}/spaces`,
            );
            const resp = await admin.patch<ApiErrorBody>(
                `/api/v1/saved/${composerChartUuid}`,
                { spaceUuid: spaces.body.results[0].uuid },
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(400);
            expect(resp.body.error.name).toBe('ComposerChartNotSupportedError');

            const dashboard = await admin.get<Body<Dashboard>>(
                `/api/v1/dashboards/${dashboardUuid}`,
            );
            expect(
                dashboard.body.results.tiles.some(
                    (tile) =>
                        isDashboardChartTileType(tile) &&
                        tile.properties.savedChartUuid === composerChartUuid &&
                        tile.properties.belongsToDashboard,
                ),
            ).toBe(true);
        });
    });
});
