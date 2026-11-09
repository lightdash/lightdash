import { QueryExecutionContext } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../api';
import { executeAsyncQuery } from './useQueryResults';

const runSavedChartQuery = async (context?: QueryExecutionContext) => {
    const lightdashApi = vi.fn().mockResolvedValue({ queryUuid: 'q' });
    await executeAsyncQuery(lightdashApi as unknown as LightdashApi, {
        projectUuid: 'project-uuid',
        tableId: 'google_analytics_report',
        chartUuid: 'chart-uuid',
        context,
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
});
