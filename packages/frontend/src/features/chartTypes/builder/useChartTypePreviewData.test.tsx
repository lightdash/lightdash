import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type DataAppVizSchema,
    type Explore,
    type ItemsMap,
    type SavedChart,
} from '@lightdash/common';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useExploreByProjectUuid } from '../../../hooks/useExplore';
import type * as chartTypePreviewQueryModule from '../utils/chartTypePreviewQuery';
import { executeChartTypePreviewQuery } from '../utils/chartTypePreviewQuery';
import { useChartTypePreviewData } from './useChartTypePreviewData';

vi.mock('../../../hooks/useExplore', () => ({
    useExploreByProjectUuid: vi.fn(),
}));
vi.mock('../utils/chartTypePreviewQuery', async (importOriginal) => {
    const actual = await importOriginal<typeof chartTypePreviewQueryModule>();
    return { ...actual, executeChartTypePreviewQuery: vi.fn() };
});

const dimension = (name: string): CompiledDimension => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'customers',
    tableLabel: 'Customers',
    sql: '',
    hidden: false,
});

const metric = (name: string): CompiledMetric => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name,
    label: name,
    table: 'customers',
    tableLabel: 'Customers',
    sql: '',
    hidden: false,
});

const explore = {
    name: 'customers',
    label: 'Customers',
    baseTable: 'customers',
    joinedTables: [],
    tables: {
        customers: {
            name: 'customers',
            label: 'Customers',
            dimensions: {
                channel: dimension('channel'),
                plan: dimension('plan'),
                segment: dimension('segment'),
            },
            metrics: { count: metric('count') },
        },
    },
} as unknown as Explore;

const sankeySchema: DataAppVizSchema = {
    fields: [
        { name: 'source', label: 'Source', type: 'dimension', required: true },
        { name: 'target', label: 'Target', type: 'dimension', required: true },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
};

const savedChart = {
    uuid: 'chart-1',
    name: 'Channel to plan',
    tableName: 'customers',
    metricQuery: {
        exploreName: 'customers',
        dimensions: ['customers_channel', 'customers_plan'],
        metrics: ['customers_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
} as unknown as SavedChart;

const resultItems: ItemsMap = {
    customers_channel: dimension('channel'),
    customers_plan: dimension('plan'),
    customers_segment: dimension('segment'),
    customers_count: metric('count'),
};

const renderPreviewData = (schema: DataAppVizSchema | null = sankeySchema) =>
    renderHook(
        ({ current }: { current: DataAppVizSchema | null }) =>
            useChartTypePreviewData({ projectUuid: 'p1', schema: current }),
        { initialProps: { current: schema } },
    );

describe('useChartTypePreviewData', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useExploreByProjectUuid).mockReturnValue({
            data: explore,
            error: null,
        } as unknown as ReturnType<typeof useExploreByProjectUuid>);
        vi.mocked(executeChartTypePreviewQuery).mockResolvedValue({
            rows: [{}, {}, {}],
            itemsMap: resultItems,
            pivotDetails: null,
        });
    });

    it('starts on sample data and runs nothing on mount', () => {
        const { result } = renderPreviewData();

        expect(result.current.selection).toEqual({ kind: 'sample' });
        expect(result.current.run).toEqual({ status: 'notRun' });
        expect(executeChartTypePreviewQuery).not.toHaveBeenCalled();
    });

    it('runs nothing when a saved chart is selected', () => {
        const { result } = renderPreviewData();

        act(() => result.current.selectSavedChart(savedChart));

        expect(result.current.selection.kind).toBe('query');
        expect(result.current.fieldMapping).toEqual({
            source: 'customers_channel',
            target: 'customers_plan',
            value: 'customers_count',
        });
        expect(result.current.run).toEqual({ status: 'notRun' });
        expect(executeChartTypePreviewQuery).not.toHaveBeenCalled();
    });

    it('runs nothing when an explore is selected', () => {
        const { result } = renderPreviewData();

        act(() => result.current.selectExplore('customers'));

        expect(result.current.selection.kind).toBe('query');
        expect(executeChartTypePreviewQuery).not.toHaveBeenCalled();
    });

    it('runs nothing when a binding changes', () => {
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));

        act(() => result.current.setField('source', 'customers_plan'));

        expect(result.current.fieldMapping.source).toBe('customers_plan');
        expect(executeChartTypePreviewQuery).not.toHaveBeenCalled();
    });

    it('runs nothing when the previewed version changes', async () => {
        const { result, rerender } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));
        act(() => result.current.runQuery());
        await waitFor(() => expect(result.current.run.status).toBe('ready'));

        rerender({
            current: {
                ...sankeySchema,
                fields: [
                    ...sankeySchema.fields,
                    {
                        name: 'extra',
                        label: 'Extra',
                        type: 'dimension',
                        required: false,
                    },
                ],
            },
        });

        expect(executeChartTypePreviewQuery).toHaveBeenCalledTimes(1);
        // The same rows keep rendering against the new declaration.
        expect(result.current.run.status).toBe('ready');
        expect(result.current.previewDataSource).toEqual(
            expect.objectContaining({ kind: 'live', rowCount: 3 }),
        );
    });

    it('runs exactly once per run', async () => {
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));

        act(() => result.current.runQuery());
        await waitFor(() => expect(result.current.run.status).toBe('ready'));

        expect(executeChartTypePreviewQuery).toHaveBeenCalledTimes(1);
        expect(result.current.previewDataSource).toEqual({
            kind: 'live',
            exploreLabel: 'Customers',
            rowCount: 3,
            ranAt: expect.any(Date),
        });

        act(() => result.current.runQuery());
        await waitFor(() =>
            expect(executeChartTypePreviewQuery).toHaveBeenCalledTimes(2),
        );
    });

    it('drops back to not run when a binding changes after a run', async () => {
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));
        act(() => result.current.runQuery());
        await waitFor(() => expect(result.current.run.status).toBe('ready'));

        act(() => result.current.setField('source', 'customers_plan'));

        expect(result.current.run).toEqual({ status: 'notRun' });
        expect(result.current.previewDataSource).toEqual({ kind: 'sample' });
        expect(executeChartTypePreviewQuery).toHaveBeenCalledTimes(1);
    });

    it('keeps the API message when a run fails', async () => {
        vi.mocked(executeChartTypePreviewQuery).mockRejectedValue(
            new Error('Column customers_plan does not exist'),
        );
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));

        act(() => result.current.runQuery());

        await waitFor(() =>
            expect(result.current.run).toEqual({
                status: 'error',
                message: 'Column customers_plan does not exist',
            }),
        );
    });

    it('reports a binding that does not fit the chart type', () => {
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));

        act(() => result.current.setField('value', 'customers_plan'));

        expect(result.current.fit).toEqual({
            status: 'doesNotFit',
            issues: [
                {
                    fieldName: 'value',
                    label: 'Value',
                    expects: 'metric',
                    mapped: {
                        fieldId: 'customers_plan',
                        kind: 'dimension',
                    },
                },
            ],
        });
    });

    it('runs once when two clicks land before the first finishes', () => {
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));

        act(() => {
            result.current.runQuery();
            result.current.runQuery();
        });

        expect(executeChartTypePreviewQuery).toHaveBeenCalledTimes(1);
    });

    it('reports an explore it cannot read instead of waiting forever', () => {
        vi.mocked(useExploreByProjectUuid).mockReturnValue({
            data: undefined,
            error: { error: { statusCode: 403, message: 'Forbidden' } },
        } as unknown as ReturnType<typeof useExploreByProjectUuid>);
        const { result } = renderPreviewData();

        act(() => result.current.selectSavedChart(savedChart));

        expect(result.current.fit).toEqual({
            status: 'unavailable',
            message: 'You do not have access to this explore.',
        });
        expect(result.current.previewDataSource).toEqual({
            kind: 'unavailable',
            message: 'You do not have access to this explore.',
        });
        expect(executeChartTypePreviewQuery).not.toHaveBeenCalled();
    });

    it('says how many inputs a mismatched binding leaves to fix', () => {
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));

        act(() => result.current.setField('value', 'customers_plan'));

        expect(result.current.previewDataSource).toEqual({
            kind: 'mismatch',
            issueCount: 1,
        });
    });

    it('keeps an input filled in for the author when another one changes', async () => {
        const { result, rerender } = renderPreviewData();
        act(() => result.current.selectExplore('customers'));
        act(() => result.current.setField('source', 'customers_channel'));
        act(() => result.current.setField('target', 'customers_plan'));
        act(() => result.current.setField('value', 'customers_count'));
        act(() => result.current.runQuery());
        await waitFor(() => expect(result.current.run.status).toBe('ready'));

        // A rebuild adds an input, which is filled from the run's columns.
        rerender({
            current: {
                ...sankeySchema,
                fields: [
                    ...sankeySchema.fields,
                    {
                        name: 'extra',
                        label: 'Extra',
                        type: 'dimension',
                        required: true,
                    },
                ],
            },
        });
        expect(result.current.fieldMapping.extra).toBeDefined();
        const filled = result.current.fieldMapping.extra;

        act(() => result.current.setField('source', 'customers_plan'));

        expect(result.current.fieldMapping.extra).toBe(filled);
    });

    it('takes the query back to sample data', () => {
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));

        act(() => result.current.selectSample());

        expect(result.current.selection).toEqual({ kind: 'sample' });
        expect(result.current.metricQuery).toBeNull();
        expect(executeChartTypePreviewQuery).not.toHaveBeenCalled();
    });

    it("re-maps a first build's own input names onto the suggested fields", async () => {
        // The suggestion inferred from/to/weight; the build declares
        // source/target/value against the very same columns.
        const { result, rerender } = renderPreviewData(null);
        act(() =>
            result.current.selectSuggestedData({
                exploreName: 'customers',
                fieldMapping: {
                    from: 'customers_channel',
                    to: 'customers_plan',
                    weight: 'customers_count',
                },
                inferredFields: [
                    {
                        name: 'from',
                        label: 'From',
                        type: 'dimension',
                        required: true,
                    },
                    {
                        name: 'to',
                        label: 'To',
                        type: 'dimension',
                        required: true,
                    },
                    {
                        name: 'weight',
                        label: 'Weight',
                        type: 'metric',
                        required: true,
                    },
                ],
            }),
        );
        act(() => result.current.runQuery());
        await waitFor(() => expect(result.current.run.status).toBe('ready'));

        rerender({ current: sankeySchema });

        await waitFor(() =>
            expect(result.current.fit).toEqual({ status: 'fits' }),
        );
        expect(result.current.fieldMapping).toEqual({
            source: 'customers_channel',
            target: 'customers_plan',
            value: 'customers_count',
        });
        expect(executeChartTypePreviewQuery).toHaveBeenCalledTimes(1);
    });

    it('leaves an ordinary version switch to reconcile itself', async () => {
        const { result, rerender } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));
        act(() => result.current.setField('source', 'customers_segment'));
        act(() => result.current.runQuery());
        await waitFor(() => expect(result.current.run.status).toBe('ready'));

        rerender({
            current: {
                ...sankeySchema,
                fields: [
                    ...sankeySchema.fields,
                    {
                        name: 'extra',
                        label: 'Extra',
                        type: 'dimension',
                        required: false,
                    },
                ],
            },
        });

        // The author's own binding survives; nothing is re-mapped under it.
        expect(result.current.fieldMapping.source).toBe('customers_segment');
    });

    it("keeps a saved chart's query when a suggestion stays in its explore", () => {
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));

        act(() =>
            result.current.selectSuggestedData({
                exploreName: 'customers',
                fieldMapping: { source: 'customers_segment' },
                inferredFields: null,
            }),
        );

        const { selection } = result.current;
        expect(selection.kind === 'query' && selection.savedChart).toEqual({
            uuid: 'chart-1',
            name: 'Channel to plan',
        });
        expect(
            selection.kind === 'query' && selection.metricQuery.dimensions,
        ).toEqual(['customers_channel', 'customers_plan']);
        expect(result.current.fieldMapping.source).toBe('customers_segment');
        expect(executeChartTypePreviewQuery).toHaveBeenCalledTimes(0);
    });

    it('starts a fresh query when a suggestion moves to another explore', () => {
        const { result } = renderPreviewData();
        act(() => result.current.selectSavedChart(savedChart));

        act(() =>
            result.current.selectSuggestedData({
                exploreName: 'orders',
                fieldMapping: {},
                inferredFields: null,
            }),
        );

        const { selection } = result.current;
        expect(selection.kind === 'query' && selection.savedChart).toBeNull();
        expect(
            selection.kind === 'query' && selection.metricQuery.exploreName,
        ).toBe('orders');
    });
});
