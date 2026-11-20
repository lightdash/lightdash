import { QueryExecutionContext } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../api';
import { executeAsyncQuery, type QueryResultsProps } from './useQueryResults';

const runSavedChartQuery = async (
    context?: QueryExecutionContext,
    args: Pick<
        QueryResultsProps,
        'includeUnpublishedDraft' | 'chartVersionUuid'
    > = {},
) => {
    const lightdashApi = vi.fn().mockResolvedValue({ queryUuid: 'q' });
    await executeAsyncQuery(lightdashApi as unknown as LightdashApi, {
        projectUuid: 'project-uuid',
        tableId: 'google_analytics_report',
        chartUuid: 'chart-uuid',
        context,
        ...args,
    });
    const [request] = lightdashApi.mock.calls[0];
    return { url: request.url, body: JSON.parse(request.body) };
};

describe('executeAsyncQuery', () => {
    it('runs a saved chart in the chart context by default', async () => {
        const { url, body } = await runSavedChartQuery();

        expect(url).toBe('/projects/project-uuid/query/chart');
        expect(body.context).toBe(QueryExecutionContext.CHART);
    });

    it('keeps the context of a scheduled delivery screenshot', async () => {
        const { body } = await runSavedChartQuery(
            QueryExecutionContext.SCHEDULED_DELIVERY,
        );

        expect(body.context).toBe(QueryExecutionContext.SCHEDULED_DELIVERY);
    });

    it("asks for the viewer's unpublished draft only when the chart has one", async () => {
        const drafted = await runSavedChartQuery(undefined, {
            includeUnpublishedDraft: true,
        });
        const published = await runSavedChartQuery(undefined, {
            includeUnpublishedDraft: false,
        });

        expect(drafted.body.includeUnpublishedDraft).toBe(true);
        expect(published.body).not.toHaveProperty('includeUnpublishedDraft');
        expect((await runSavedChartQuery()).body).not.toHaveProperty(
            'includeUnpublishedDraft',
        );
    });

    it('never asks for a draft when running a chart version', async () => {
        const { body } = await runSavedChartQuery(undefined, {
            includeUnpublishedDraft: true,
            chartVersionUuid: 'version-uuid',
        });

        expect(body.versionUuid).toBe('version-uuid');
        expect(body).not.toHaveProperty('includeUnpublishedDraft');
    });
    it('runs a dashboard tile render through the dashboard, as the tile ran it', async () => {
        const lightdashApi = vi.fn().mockResolvedValue({ queryUuid: 'q' });
        const dashboardTileRenderRequest = {
            dashboardUuid: 'dashboard-uuid',
            tileUuid: 'tile-uuid',
            dashboardFilters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            dashboardSorts: [{ fieldId: 'orders_count', descending: true }],
            dateZoom: { granularity: 'week' },
            parameters: { region: 'emea' },
        };
        await executeAsyncQuery(lightdashApi as unknown as LightdashApi, {
            projectUuid: 'project-uuid',
            tableId: 'orders',
            chartUuid: 'chart-uuid',
            // The saved chart's own parameters must not replace the tile's
            parameters: { region: 'apac' },
            dashboardTileRenderRequest,
        });

        const [request] = lightdashApi.mock.calls[0];
        expect(request.url).toBe(
            '/projects/project-uuid/query/dashboard-chart',
        );
        expect(JSON.parse(request.body)).toMatchObject({
            ...dashboardTileRenderRequest,
            chartUuid: 'chart-uuid',
        });
    });
});
