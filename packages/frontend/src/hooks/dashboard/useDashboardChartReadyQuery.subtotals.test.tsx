import {
    ChartType,
    QueryExecutionContext,
    QueryHistoryStatus,
} from '@lightdash/common';
import type * as LightdashCommon from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboardChartReadyQuery } from './useDashboardChartReadyQuery';

const mocks = vi.hoisted(() => ({
    api: vi.fn(),
    metadata: vi.fn(),
    chart: vi.fn(),
    markTileLoaded: vi.fn(),
    poll: vi.fn(),
}));

vi.mock('@lightdash/common', async (importOriginal) => ({
    ...(await importOriginal<typeof LightdashCommon>()),
    getDateZoomCapabilities: () => ({
        hasDateDimension: false,
        hasTimestampDimension: false,
        availableCustomGranularities: {},
    }),
    getChartZoomableFields: () => [],
    getDateZoomXAxisFieldId: () => undefined,
    getAvailableParametersFromTables: () => [],
    hasReservedParameterReference: () => false,
    resolveTileDateZoom: () => undefined,
}));
vi.mock('../../features/queryRunner/executeQuery', () => ({
    pollForResults: mocks.poll,
}));
vi.mock('../../api', () => ({ lightdashApi: mocks.api }));
vi.mock('../../features/chartTypes/hooks/useDataAppVizRender', () => ({
    useDataAppVizRenderMetadata: mocks.metadata,
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (state: unknown) => unknown) =>
        selector({
            dashboard: { uuid: 'dashboard-1' },
            chartSort: {},
            parameterValues: {},
            addParameterReferences: vi.fn(),
            tileParameterReferences: {},
            dateZoomGranularity: undefined,
            dateZoomConfig: undefined,
            controlGranularities: {},
            addParameterDefinitions: vi.fn(),
            setChartZoomableFields: vi.fn(),
            setTilesWithDateZoomApplied: vi.fn(),
            projectUuid: 'project-1',
            includeUnpublishedDraft: false,
        }),
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: (selector: (state: unknown) => unknown) =>
        selector({
            invalidateCache: false,
            isAutoRefresh: false,
            markTileLoaded: mocks.markTileLoaded,
            addAvailableCustomGranularities: vi.fn(),
        }),
}));
vi.mock('./useDashboardFiltersForTile', () => ({
    default: () => ({ dimensions: [], metrics: [], tableCalculations: [] }),
}));
vi.mock('../useSavedQuery', () => ({ useSavedQuery: mocks.chart }));
vi.mock('../useExplore', () => ({
    useExplore: () => ({ data: { tables: {}, name: 'orders' } }),
}));
vi.mock('../useQueryRetry', () => ({
    useQueryRetryConfig: () => ({ retry: false }),
}));
vi.mock('../useSearchParams', () => ({ default: () => undefined }));
vi.mock('../useSessionTimezone', () => ({
    useSessionTimezone: () => undefined,
}));

describe('dashboard subtotal startup', () => {
    const chart = {
        uuid: 'chart-1',
        projectUuid: 'project-1',
        metricQuery: { exploreName: 'orders' },
        chartConfig: {
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: 'viz-1',
                dataAppVizVersion: 4,
                fieldMapping: { path: ['orders_country', 'orders_city'] },
            },
        },
    };
    const readyMetadata = {
        data: {
            state: 'ready',
            schema: {
                hierarchy: { field: 'path' },
                fields: [
                    {
                        name: 'path',
                        label: 'Path',
                        type: 'dimension',
                        required: true,
                        multiple: true,
                    },
                ],
                configOptions: [],
                colorPalette: null,
            },
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.chart.mockReturnValue({ data: chart, error: null });
        mocks.api.mockResolvedValue({
            queryUuid: 'root-query',
            fields: {},
            metricQuery: chart.metricQuery,
        });
    });

    const setup = (context?: QueryExecutionContext) => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
        return renderHook(
            () => useDashboardChartReadyQuery('tile-1', 'chart-1', context),
            { wrapper },
        );
    };

    it('waits for pinned metadata before running only the root dashboard query', async () => {
        mocks.metadata.mockReturnValue({ data: undefined });
        const rendered = setup();
        expect(mocks.api).not.toHaveBeenCalled();
        mocks.metadata.mockReturnValue(readyMetadata);
        rendered.rerender();
        await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
        const request = vi.mocked(mocks.api).mock.calls[0][0];
        expect(request.url).toBe('/projects/project-1/query/dashboard-chart');
        expect(JSON.parse(request.body)).toMatchObject({
            chartUuid: 'chart-1',
            tileUuid: 'tile-1',
            dashboardUuid: 'dashboard-1',
            subtotalLevel: {
                subtotalDimensions: ['orders_country'],
                parent: [],
            },
            pivotResults: true,
        });
    });

    it('uses the authorized embed tile route for roots', async () => {
        mocks.metadata.mockReturnValue(readyMetadata);
        setup(QueryExecutionContext.EMBED);
        await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(1));
        const request = vi.mocked(mocks.api).mock.calls[0][0];
        expect(request.url).toBe('/embed/project-1/query/dashboard-tile');
        expect(JSON.parse(request.body).subtotalLevel).toEqual({
            subtotalDimensions: ['orders_country'],
            parent: [],
        });
    });

    it.each([QueryExecutionContext.DASHBOARD, QueryExecutionContext.EMBED])(
        'preserves source pivot grouping for %s roots and children',
        async (context) => {
            mocks.metadata.mockReturnValue(readyMetadata);
            const rows = [
                {
                    orders_city: {
                        value: { raw: 'Porto', formatted: 'Porto' },
                    },
                    orders_status: {
                        value: { raw: 'paid', formatted: 'Paid' },
                    },
                },
                {
                    orders_city: {
                        value: { raw: 'Porto', formatted: 'Porto' },
                    },
                    orders_status: {
                        value: { raw: 'pending', formatted: 'Pending' },
                    },
                },
            ];
            mocks.poll.mockResolvedValue({
                status: QueryHistoryStatus.READY,
                rows,
            });
            const { result } = setup(context);
            await waitFor(() =>
                expect(result.current.vizSubtotals).toBeDefined(),
            );
            await expect(
                result.current.vizSubtotals!.get({
                    level: 1,
                    parentValues: ['Portugal'],
                }),
            ).resolves.toEqual({ rows });
            expect(mocks.api).toHaveBeenCalledTimes(2);
            for (const [request] of mocks.api.mock.calls) {
                expect(JSON.parse(request.body).pivotResults).toBe(true);
                expect(request.url).toBe(
                    context === QueryExecutionContext.EMBED
                        ? '/embed/project-1/query/dashboard-tile'
                        : '/projects/project-1/query/dashboard-chart',
                );
            }
            expect(
                JSON.parse(mocks.api.mock.calls[1][0].body).subtotalLevel,
            ).toEqual({
                subtotalDimensions: ['orders_city'],
                parent: [{ dimensionId: 'orders_country', value: 'Portugal' }],
            });
        },
    );

    it.each([
        ['building', 'still generating'],
        ['unavailable', 'unavailable'],
        ['failed', 'failed to generate'],
    ])('exposes %s metadata as a visible error', (state, message) => {
        mocks.metadata.mockReturnValue({
            data: { state, latestBuildInProgress: state === 'building' },
            error: null,
        });
        const rendered = setup();
        expect(rendered.result.current.error).toBeInstanceOf(Error);
        expect((rendered.result.current.error as Error).message).toContain(
            message,
        );
        expect(mocks.api).not.toHaveBeenCalled();
        const error = rendered.result.current.error;
        rendered.rerender();
        expect(rendered.result.current.error).toBe(error);
    });

    it('exposes a metadata authorization failure without running detail query', () => {
        const metadataError = {
            error: { statusCode: 403, message: 'Forbidden' },
        };
        mocks.metadata.mockReturnValue({
            data: undefined,
            error: metadataError,
        });
        const rendered = setup();
        expect(rendered.result.current.error).toBe(metadataError);
        expect(mocks.api).not.toHaveBeenCalled();
    });

    it.each([
        ['empty', [], 'dimension'],
        ['duplicate', ['orders_country', 'orders_country'], 'dimension'],
        ['non-dimension', ['orders_country'], 'metric'],
    ])(
        'reports an %s hierarchy binding and marks the tile loaded',
        (name, binding, fieldType) => {
            mocks.chart.mockReturnValue({
                data: {
                    ...chart,
                    chartConfig: {
                        ...chart.chartConfig,
                        config: {
                            ...chart.chartConfig.config,
                            fieldMapping: { path: binding },
                        },
                    },
                },
                error: null,
            });
            mocks.metadata.mockReturnValue({
                data: {
                    ...readyMetadata.data,
                    schema: {
                        ...readyMetadata.data.schema,
                        fields: readyMetadata.data.schema.fields.map(
                            (field) => ({
                                ...field,
                                type: fieldType,
                            }),
                        ),
                    },
                },
            });

            const rendered = setup();

            expect((rendered.result.current.error as Error).message).toMatch(
                /bind.*hierarchy.*dimension/i,
            );
            expect(mocks.api).not.toHaveBeenCalled();
            expect(mocks.markTileLoaded).toHaveBeenCalledWith('tile-1');
        },
    );
});
