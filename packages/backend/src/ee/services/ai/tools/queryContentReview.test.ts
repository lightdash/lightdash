import {
    CustomDimensionType,
    DimensionType,
    FilterOperator,
    type CustomDimension,
    type ToolRunContentQueryArgs,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { metricQueryMock } from '../../../../services/ProjectService/ProjectService.mock';
import { EMPTY_QUERY_GUIDANCE } from '../decisions/queryReview';
import { getRunContentQuery } from './runContentQuery';
import { getRunSavedChart } from './runSavedChart';

const actualQuery = {
    ...metricQueryMock,
    limit: 40,
    filters: {
        dimensions: {
            id: 'and',
            and: [
                {
                    id: 'region',
                    target: { fieldId: 'a_dim1' },
                    operator: FilterOperator.EQUALS,
                    values: ['EMEA'],
                },
            ],
        },
    },
};
const execution = {
    metricQuery: actualQuery,
    usedParametersValues: { region: 'EMEA' },
    resolvedTimezone: 'Europe/London',
};
const chart = {
    uuid: 'chart',
    name: 'Orders',
    metricQuery: { ...metricQueryMock, limit: 100 },
    parameters: { region: 'saved-value' },
};
const makeDependencies = (rows = [{ a_dim1: 'EMEA', a_met1: 42 }]) => ({
    reviewQuery: vi
        .fn()
        .mockImplementation(async (_plan, result) =>
            result?.emptyResult
                ? EMPTY_QUERY_GUIDANCE + result.review
                : ' Query/question review: check the requested measure.',
        ),
    updateProgress: vi.fn().mockResolvedValue(undefined),
    runAsyncQuery: vi.fn().mockResolvedValue({
        queryUuid: 'query',
        rows,
        fields: {},
        cacheMetadata: { cacheHit: false },
    }),
    runSavedChartQuery: vi.fn().mockResolvedValue({
        queryUuid: 'saved-query',
        rows,
        fields: {},
        cacheMetadata: { cacheHit: false },
        execution,
    }),
    getSavedChart: vi.fn().mockResolvedValue(chart),
    validateContent: vi.fn(),
    maxLimit: 50,
    maxContextRows: 50,
    enableDataAccess: true,
});
const options = { messages: [], toolCallId: 'call' };

describe('content and saved query review', () => {
    it('keeps the original saved-chart query and call signature without decisions', async () => {
        const deps = { ...makeDependencies(), reviewQuery: undefined };
        const metricQuery = {
            ...chart.metricQuery,
            timezone: 'Europe/London',
            customDimensions: [],
        };
        deps.getSavedChart.mockResolvedValue({ ...chart, metricQuery });
        await getRunSavedChart(deps).execute!({ chartUuid: 'chart' }, options);
        const {
            exploreName,
            dimensions,
            metrics,
            sorts,
            tableCalculations,
            additionalMetrics,
            filters,
        } = metricQuery;
        expect(deps.runAsyncQuery).toHaveBeenCalledExactlyOnceWith({
            exploreName,
            dimensions,
            metrics,
            sorts,
            tableCalculations,
            additionalMetrics: additionalMetrics ?? [],
            filters,
            customMetrics: null,
            limit: 50,
        });
    });

    it('starts saved-content review before result polling completes and reviews only once', async () => {
        const deps = makeDependencies();
        let complete!: () => void;
        deps.runSavedChartQuery.mockImplementation(async (args) => {
            args.onQueryPrepared(execution);
            await new Promise<void>((resolve) => {
                complete = resolve;
            });
            return {
                queryUuid: 'query',
                rows: [{ a_met1: 42 }],
                fields: {},
                execution,
                cacheMetadata: { cacheHit: false },
            };
        });
        const pending = getRunContentQuery(deps).execute!(
            { source: { type: 'chart', chartSlug: 'chart', limit: 100 } },
            options,
        );
        await vi.waitFor(() => expect(deps.reviewQuery).toHaveBeenCalledOnce());
        complete();
        expect(await pending).toMatchObject({
            result: expect.stringContaining('Query/question review'),
        });
        expect(deps.reviewQuery).toHaveBeenCalledOnce();
    });
    it.each([false, true])(
        'reviews the executed saved/dashboard query, not the stored chart (dashboard=%s)',
        async (dashboard) => {
            const deps = makeDependencies();
            const source: ToolRunContentQueryArgs['source'] = dashboard
                ? {
                      type: 'dashboardChart',
                      chartSlug: 'chart',
                      dashboardSlug: 'dashboard',
                      limit: 100,
                  }
                : { type: 'chart', chartSlug: 'chart', limit: 100 };
            const output = await getRunContentQuery(deps).execute!(
                { source },
                options,
            );
            expect(output).toMatchObject({
                metadata: { status: 'success' },
                result: expect.stringContaining('Query/question review'),
            });
            expect(output).toMatchObject({
                result: expect.stringContaining('Limit: 40'),
            });
            expect(deps.reviewQuery).toHaveBeenCalledExactlyOnceWith({
                kind: 'semantic',
                query: actualQuery,
                parameters: { region: 'EMEA' },
                timezone: 'Europe/London',
            });
            expect(deps.runSavedChartQuery).toHaveBeenCalledOnce();
            expect(deps.runAsyncQuery).not.toHaveBeenCalled();
        },
    );
    it('preserves stored parameters and other query settings when running a saved chart directly', async () => {
        const deps = makeDependencies();
        const customDimension: CustomDimension = {
            id: 'custom',
            name: 'Custom',
            table: 'a',
            type: CustomDimensionType.SQL,
            sql: 'UPPER(${a.dim1})',
            dimensionType: DimensionType.STRING,
        };
        deps.getSavedChart.mockResolvedValue({
            ...chart,
            metricQuery: {
                ...chart.metricQuery,
                customDimensions: [customDimension],
            },
        });
        const output = await getRunSavedChart(deps).execute!(
            { chartUuid: 'chart' },
            options,
        );
        expect(output).toMatchObject({
            metadata: { status: 'success' },
            result: expect.stringContaining('Query/question review'),
        });
        expect(deps.runAsyncQuery).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                limit: 50,
                customDimensions: [customDimension],
            }),
            undefined,
            chart.parameters,
        );
        expect(deps.reviewQuery).toHaveBeenCalledExactlyOnceWith({
            kind: 'semantic',
            query: deps.runAsyncQuery.mock.calls[0][0],
            parameters: chart.parameters,
        });
    });
    it('reviews a raw content query with its actual capped limit and supplied parameters', async () => {
        const deps = makeDependencies();
        const source: ToolRunContentQueryArgs['source'] = {
            type: 'metricQuery',
            tableName: 'a',
            metricQuery: { ...actualQuery, limit: 200 },
            parameters: { region: 'EMEA' },
        };
        const output = await getRunContentQuery(deps).execute!(
            { source },
            options,
        );
        expect(output).toMatchObject({
            metadata: { status: 'success' },
            result: expect.stringContaining('Query/question review'),
        });
        expect(deps.runAsyncQuery).toHaveBeenCalledOnce();
        expect(deps.reviewQuery).toHaveBeenCalledExactlyOnceWith({
            kind: 'semantic',
            query: deps.runAsyncQuery.mock.calls[0][0],
            parameters: { region: 'EMEA' },
        });
        expect(deps.runAsyncQuery.mock.calls[0][0].limit).toBe(50);
    });
    it.each(['saved', 'content'] as const)(
        'retains advice and scope-preserving guidance for empty %s results',
        async (kind) => {
            const deps = makeDependencies([]);
            const output =
                kind === 'saved'
                    ? await getRunSavedChart(deps).execute!(
                          { chartUuid: 'chart' },
                          options,
                      )
                    : await getRunContentQuery(deps).execute!(
                          {
                              source: {
                                  type: 'chart',
                                  chartSlug: 'chart',
                                  limit: 100,
                              },
                          },
                          options,
                      );
            expect(output).toMatchObject({
                result: expect.stringContaining('Preserve the user’s scope'),
            });
            expect(output).toMatchObject({
                result: expect.stringContaining('Query/question review'),
            });
            expect(deps.reviewQuery).toHaveBeenCalledTimes(2);
            expect(deps.reviewQuery.mock.calls[1]).toEqual([
                deps.reviewQuery.mock.calls[0][0],
                {
                    emptyResult: true,
                    review: ' Query/question review: check the requested measure.',
                },
            ]);
            expect(deps.reviewQuery.mock.calls[1][0].parameters).toEqual(
                kind === 'saved'
                    ? chart.parameters
                    : execution.usedParametersValues,
            );
            expect(
                kind === 'saved' ? deps.runAsyncQuery : deps.runSavedChartQuery,
            ).toHaveBeenCalledOnce();
        },
    );
    it.each(['saved', 'content'] as const)(
        'skips query execution and review with data access disabled for %s',
        async (kind) => {
            const deps = { ...makeDependencies(), enableDataAccess: false };
            const output =
                kind === 'saved'
                    ? await getRunSavedChart(deps).execute!(
                          { chartUuid: 'chart' },
                          options,
                      )
                    : await getRunContentQuery(deps).execute!(
                          {
                              source: {
                                  type: 'chart',
                                  chartSlug: 'chart',
                                  limit: 100,
                              },
                          },
                          options,
                      );
            expect(output).toMatchObject({
                result: expect.stringContaining('Data access is disabled'),
            });
            expect(deps.reviewQuery).not.toHaveBeenCalled();
            expect(deps.runAsyncQuery).not.toHaveBeenCalled();
            expect(deps.runSavedChartQuery).not.toHaveBeenCalled();
        },
    );
});
