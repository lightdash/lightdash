import { ChartType } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQueryExecutor } from '../providers/Explorer/useQueryExecutor';
import { useExplorerQueryManager } from './useExplorerQueryManager';

const mocks = vi.hoisted(() => ({
    metadata: vi.fn(),
    chartVersionUuid: undefined as string | undefined,
    selectorValues: new Map<unknown, unknown>(),
}));

vi.mock('../features/explorer/store', () => {
    const selectors = [
        'selectIsEditMode',
        'selectIsMinimal',
        'selectMetricQuery',
        'selectParameterDefinitions',
        'selectParameterReferences',
        'selectParameters',
        'selectQueryUuidHistory',
        'selectSavedChart',
        'selectTableName',
        'selectUnpivotedQueryArgs',
        'selectUnpivotedQueryUuidHistory',
        'selectUnsavedChartVersion',
        'selectValidQueryArgs',
    ];
    const exports = Object.fromEntries(selectors.map((name) => [name, name]));
    return {
        ...exports,
        useExplorerSelector: (selector: unknown) =>
            mocks.selectorValues.get(selector),
        useExplorerDispatch: () => vi.fn(),
        explorerActions: {
            setQueryUuidHistory: vi.fn(),
            setUnpivotedQueryUuidHistory: vi.fn(),
            setValidQueryArgs: vi.fn(),
        },
    };
});
vi.mock('../features/chartTypes/hooks/useDataAppVizRender', () => ({
    useDataAppVizRenderMetadata: mocks.metadata,
}));
vi.mock('../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => null,
}));
vi.mock('../providers/Explorer/useQueryExecutor', () => ({
    useQueryExecutor: vi.fn(() => [
        {
            query: { isFetching: false, isFetched: false },
            queryResults: {
                isFetchingFirstPage: false,
                isFetchingAllPages: false,
                error: null,
            },
        },
        vi.fn(),
    ]),
}));
vi.mock('../features/apps/ChartVersionPreview/useChartVersionPreview', () => ({
    useChartVersionPreview: () => mocks.chartVersionUuid,
}));
vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ embedToken: undefined }),
}));
vi.mock('./useProjectUuid', () => ({ useProjectUuid: () => 'project-1' }));
vi.mock('./useExplore', () => ({
    useExploreByProjectUuid: () => ({ data: undefined }),
}));
vi.mock('./usePreAggregateCacheEnabled', () => ({
    usePreAggregateCacheEnabled: () => [false],
}));
vi.mock('./useExplorerRoute', () => ({
    useDateZoomGranularitySearch: () => undefined,
}));
vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({ savedQueryUuid: 'chart-1' }),
}));

describe('Explorer subtotal startup', () => {
    const metricQuery = {
        exploreName: 'orders',
        dimensions: ['orders_country', 'orders_city'],
        metrics: ['orders_amount'],
        filters: {},
        sorts: [],
        tableCalculations: [],
        limit: 100,
    };
    const chartConfig = {
        type: ChartType.DATA_APP_VIZ,
        config: {
            dataAppVizUuid: 'viz-1',
            dataAppVizVersion: 4,
            fieldMapping: { path: ['orders_country', 'orders_city'] },
        },
    };
    const originalArgs = {
        projectUuid: 'project-1',
        tableId: 'orders',
        chartUuid: 'chart-1',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.chartVersionUuid = undefined;
        mocks.selectorValues.clear();
        mocks.selectorValues.set('selectIsEditMode', false);
        mocks.selectorValues.set('selectIsMinimal', false);
        mocks.selectorValues.set('selectMetricQuery', metricQuery);
        mocks.selectorValues.set('selectParameterDefinitions', {});
        mocks.selectorValues.set('selectParameterReferences', []);
        mocks.selectorValues.set('selectParameters', {});
        mocks.selectorValues.set('selectQueryUuidHistory', []);
        mocks.selectorValues.set('selectSavedChart', {
            uuid: 'chart-1',
            chartConfig,
        });
        mocks.selectorValues.set('selectTableName', 'orders');
        mocks.selectorValues.set('selectUnpivotedQueryArgs', null);
        mocks.selectorValues.set('selectUnpivotedQueryUuidHistory', []);
        mocks.selectorValues.set('selectUnsavedChartVersion', {
            chartConfig,
            pivotConfig: undefined,
        });
        mocks.selectorValues.set('selectValidQueryArgs', originalArgs);
    });

    it('holds the detail query while metadata is pending, then starts roots only', () => {
        mocks.metadata.mockReturnValue({ data: undefined });
        const rendered = renderHook(() => useExplorerQueryManager());
        expect(vi.mocked(useQueryExecutor).mock.calls[0][2]).toBe(false);

        vi.mocked(useQueryExecutor).mockClear();
        mocks.metadata.mockReturnValue({
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
        });
        rendered.rerender();
        expect(vi.mocked(useQueryExecutor).mock.calls[0][0]).toMatchObject({
            ...originalArgs,
            subtotalLevel: {
                subtotalDimensions: ['orders_country'],
                parent: [],
            },
            pivotResults: false,
        });
        expect(vi.mocked(useQueryExecutor).mock.calls[0][2]).toBe(true);
    });

    it.each([
        ['empty', [], 'dimension'],
        ['duplicate', ['orders_country', 'orders_country'], 'dimension'],
        ['non-dimension', ['orders_country'], 'metric'],
    ])(
        'does not execute an %s hierarchy binding',
        (_name, binding, fieldType) => {
            const invalidChartConfig = {
                ...chartConfig,
                config: {
                    ...chartConfig.config,
                    fieldMapping: { path: binding },
                },
            };
            mocks.selectorValues.set('selectUnsavedChartVersion', {
                chartConfig: invalidChartConfig,
                pivotConfig: undefined,
            });
            mocks.metadata.mockReturnValue({
                data: {
                    state: 'ready',
                    schema: {
                        hierarchy: { field: 'path' },
                        fields: [
                            {
                                name: 'path',
                                label: 'Path',
                                type: fieldType,
                                required: true,
                                multiple: true,
                            },
                        ],
                        configOptions: [],
                        colorPalette: null,
                    },
                },
            });

            renderHook(() => useExplorerQueryManager());

            expect(vi.mocked(useQueryExecutor).mock.calls[0][2]).toBe(false);
        },
    );

    it('uses chartless metadata for a different custom type selected in edit mode', () => {
        mocks.selectorValues.set('selectIsEditMode', true);
        mocks.selectorValues.set('selectSavedChart', {
            uuid: 'chart-1',
            chartConfig: {
                ...chartConfig,
                config: { ...chartConfig.config, dataAppVizUuid: 'viz-old' },
            },
        });
        mocks.metadata.mockReturnValue({ data: undefined });
        renderHook(() => useExplorerQueryManager());

        expect(mocks.metadata).toHaveBeenCalledWith(
            'project-1',
            'viz-1',
            {
                isEmbedded: false,
                savedChartUuid: undefined,
                chartVersionUuid: undefined,
            },
            undefined,
        );
        expect(vi.mocked(useQueryExecutor).mock.calls[0][2]).toBe(false);
    });

    it('pins metadata to a historical saved chart version', () => {
        mocks.selectorValues.set('selectIsEditMode', true);
        mocks.chartVersionUuid = 'version-1';
        mocks.metadata.mockReturnValue({ data: undefined });
        renderHook(() => useExplorerQueryManager());

        expect(mocks.metadata).toHaveBeenCalledWith(
            'project-1',
            'viz-1',
            {
                isEmbedded: false,
                savedChartUuid: 'chart-1',
                chartVersionUuid: 'version-1',
            },
            4,
        );
    });

    it('uses the resolved chart UUID when the route identifies a chart by slug', () => {
        mocks.selectorValues.set('selectSavedChart', {
            uuid: 'canonical-chart-uuid',
            chartConfig,
        });
        mocks.metadata.mockReturnValue({ data: undefined });
        renderHook(() => useExplorerQueryManager());

        expect(mocks.metadata).toHaveBeenCalledWith(
            'project-1',
            'viz-1',
            {
                isEmbedded: false,
                savedChartUuid: 'canonical-chart-uuid',
                chartVersionUuid: undefined,
            },
            4,
        );
    });

    it('waits for chart identity before requesting saved-chart metadata', () => {
        mocks.selectorValues.set('selectSavedChart', undefined);
        mocks.metadata.mockReturnValue({ data: undefined });
        renderHook(() => useExplorerQueryManager());

        expect(mocks.metadata).toHaveBeenCalledWith(
            'project-1',
            null,
            {
                isEmbedded: false,
                savedChartUuid: undefined,
                chartVersionUuid: undefined,
            },
            4,
        );
        expect(vi.mocked(useQueryExecutor).mock.calls[0][2]).toBe(false);
    });
});
