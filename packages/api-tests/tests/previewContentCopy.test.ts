import {
    DashboardTileTypes,
    SEED_PROJECT,
    type ApiCreatePreviewResults,
    type Dashboard,
    type DashboardBasicDetails,
    type SavedChart,
} from '@lightdash/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiClient } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { chartMock } from '../helpers/mocks';
import { TestResourceTracker, uniqueName } from '../helpers/test-isolation';

const apiUrl = '/api/v1';
const projectUuid = SEED_PROJECT.project_uuid;

describe('Preview content copy', () => {
    let admin: ApiClient;
    const tracker = new TestResourceTracker();
    let previewProjectUuid: string | null = null;
    let sourceDashboard: Dashboard;
    let sourceChart: SavedChart;

    beforeAll(async () => {
        admin = await login();

        const dashboardResponse = await admin.post<{ results: Dashboard }>(
            `${apiUrl}/projects/${projectUuid}/dashboards`,
            { name: uniqueName('preview copy dashboard'), tiles: [], tabs: [] },
        );
        expect(dashboardResponse.status).toBe(201);
        sourceDashboard = dashboardResponse.body.results;
        tracker.trackDashboard(sourceDashboard.uuid);

        const chartResponse = await admin.post<{ results: SavedChart }>(
            `${apiUrl}/projects/${projectUuid}/saved`,
            {
                ...chartMock,
                name: uniqueName('preview copy chart'),
                dashboardUuid: sourceDashboard.uuid,
                spaceUuid: null,
            },
        );
        expect(chartResponse.status).toBe(200);
        sourceChart = chartResponse.body.results;
        tracker.trackChart(sourceChart.uuid);

        const tileResponse = await admin.patch<{ results: Dashboard }>(
            `${apiUrl}/dashboards/${sourceDashboard.uuid}`,
            {
                tabs: [],
                tiles: [
                    {
                        type: DashboardTileTypes.SAVED_CHART,
                        x: 0,
                        y: 0,
                        h: 5,
                        w: 5,
                        properties: { savedChartUuid: sourceChart.uuid },
                    },
                ],
            },
        );
        expect(tileResponse.status).toBe(200);
    });

    afterAll(async () => {
        if (previewProjectUuid) {
            await admin.delete(`${apiUrl}/org/projects/${previewProjectUuid}`);
        }
        await tracker.cleanup(admin);
    });

    it('copies a chart that belongs to a dashboard onto the preview dashboard', async () => {
        const previewResponse = await admin.post<{
            results: ApiCreatePreviewResults;
        }>(`${apiUrl}/projects/${projectUuid}/createPreview`, {
            name: uniqueName('preview content copy'),
            copyContent: true,
        });
        // Capture before asserting so a failed assertion still cleans the project up
        previewProjectUuid = previewResponse.body.results?.projectUuid ?? null;
        expect(previewResponse.status).toBe(200);

        const dashboardsResponse = await admin.get<{
            results: DashboardBasicDetails[];
        }>(`${apiUrl}/projects/${previewProjectUuid}/dashboards`);
        expect(dashboardsResponse.status).toBe(200);
        const previewDashboardSummary = dashboardsResponse.body.results.find(
            (dashboard) => dashboard.name === sourceDashboard.name,
        );
        if (!previewDashboardSummary) {
            throw new Error('Dashboard was not copied into the preview');
        }
        expect(previewDashboardSummary.uuid).not.toBe(sourceDashboard.uuid);

        const previewDashboardResponse = await admin.get<{
            results: Dashboard;
        }>(`${apiUrl}/dashboards/${previewDashboardSummary.uuid}`);
        expect(previewDashboardResponse.status).toBe(200);
        const previewDashboard = previewDashboardResponse.body.results;
        expect(previewDashboard.projectUuid).toBe(previewProjectUuid);

        const chartTile = previewDashboard.tiles.find(
            (tile) => tile.type === DashboardTileTypes.SAVED_CHART,
        );
        if (chartTile?.type !== DashboardTileTypes.SAVED_CHART) {
            throw new Error('Chart tile was not copied into the preview');
        }
        const previewChartUuid = chartTile.properties.savedChartUuid;
        expect(previewChartUuid).not.toBeNull();
        expect(previewChartUuid).not.toBe(sourceChart.uuid);

        const previewChartResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${previewChartUuid}`,
        );
        expect(previewChartResponse.status).toBe(200);
        const previewChart = previewChartResponse.body.results;
        expect(previewChart.projectUuid).toBe(previewProjectUuid);
        expect(previewChart.dashboardUuid).toBe(previewDashboard.uuid);
        expect(previewChart.spaceUuid).toBe(previewDashboard.spaceUuid);
        expect(previewChart.name).toBe(sourceChart.name);

        const sourceChartResponse = await admin.get<{ results: SavedChart }>(
            `${apiUrl}/saved/${sourceChart.uuid}`,
        );
        expect(sourceChartResponse.body.results.dashboardUuid).toBe(
            sourceDashboard.uuid,
        );
    });
});
