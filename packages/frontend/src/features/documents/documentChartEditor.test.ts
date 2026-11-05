import {
    ChartType,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    SupportedDbtAdapter,
    type Explore,
    type SemanticChartAsCode,
} from '@lightdash/common';
import {
    buildDocumentChartEditorState,
    getDefaultDocumentChartName,
    getDocumentChartFromVersion,
    getDocumentChartVersion,
} from './documentChartEditor';

const chart: SemanticChartAsCode = {
    name: 'Orders',
    description: 'Daily orders',
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_date'],
        metrics: ['orders_count'],
        filters: {
            dimensions: {
                and: [
                    {
                        target: { fieldId: 'orders_status' },
                        operator: FilterOperator.EQUALS,
                        values: ['completed'],
                    },
                ],
            },
        },
        sorts: [{ fieldId: 'orders_date', descending: true }],
        limit: 250,
        tableCalculations: [
            {
                name: 'double',
                displayName: 'Double',
                sql: '${orders.count} * 2',
            },
        ],
    },
    chartConfig: { type: ChartType.TABLE },
    tableConfig: { columnOrder: ['orders_count', 'orders_date'] },
    pivotConfig: { columns: ['orders_date'] },
    parameters: { category: 'retail' },
};

it('creates isolated unsaved editor state without a saved chart or route state', () => {
    const state = buildDocumentChartEditorState(chart, chart.tableName);
    expect(state.savedChart).toBeUndefined();
    expect(state.isEditMode).toBe(true);
    expect(state.unsavedChartVersion.parameters).toEqual(chart.parameters);
    expect(state.parameterReferences).toEqual(['category']);
    expect(
        state.unsavedChartVersion.metricQuery.filters.dimensions?.id,
    ).toEqual(expect.any(String));
    expect(chart.metricQuery.filters.dimensions).not.toHaveProperty('id');
});

it('round-trips full semantic configuration and metadata without persistence fields', () => {
    const version = getDocumentChartVersion(chart);
    const result = getDocumentChartFromVersion(version, 'Renamed', 'Notes');
    expect(result).toEqual({
        ...chart,
        name: 'Renamed',
        description: 'Notes',
        metricQuery: version.metricQuery,
    });
    expect(result).not.toHaveProperty('uuid');
    expect(result).not.toHaveProperty('spaceUuid');
});

it('starts a new chart with its selected explore and no selected fields', () => {
    const state = buildDocumentChartEditorState(null, 'orders');
    expect(state.unsavedChartVersion.tableName).toBe('orders');
    expect(state.unsavedChartVersion.metricQuery.exploreName).toBe('orders');
    expect(state.unsavedChartVersion.metricQuery.metrics).toEqual([]);
});

it('round-trips a custom chart type binding through the chart editor', () => {
    const binding = {
        dataAppVizUuid: 'viz-1',
        dataAppVizVersion: 2,
        fieldMapping: { category: 'orders_status' },
        optionValues: { stacked: true },
    };
    const version = getDocumentChartVersion({
        ...chart,
        chartConfig: {
            type: ChartType.DATA_APP_VIZ,
            config: { ...binding, dataAppVizSlug: 'grouped-bars' },
        },
    });
    // The editor works on the runtime binding; the slug is only for portability.
    expect(version.chartConfig).toEqual({
        type: ChartType.DATA_APP_VIZ,
        config: binding,
    });
    expect(
        getDocumentChartFromVersion(version, 'Custom', '').chartConfig,
    ).toEqual({ type: ChartType.DATA_APP_VIZ, config: binding });
});

describe('getDefaultDocumentChartName', () => {
    const field = {
        table: 'orders',
        tableLabel: 'Orders',
        sql: '',
        compiledSql: '',
        tablesReferences: [],
    };
    const explore: Explore = {
        name: 'orders',
        label: 'Orders',
        tags: [],
        baseTable: 'orders',
        joinedTables: [],
        tables: {
            orders: {
                name: 'orders',
                label: 'Orders',
                database: '',
                schema: '',
                sqlTable: 'orders',
                dimensions: {
                    date: {
                        ...field,
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.DATE,
                        name: 'date',
                        label: 'Order date',
                        hidden: false,
                    },
                },
                metrics: {
                    count: {
                        ...field,
                        fieldType: FieldType.METRIC,
                        type: MetricType.COUNT,
                        name: 'count',
                        label: 'Order count',
                        hidden: false,
                    },
                },
                lineageGraph: {},
            },
        },
        targetDatabase: SupportedDbtAdapter.POSTGRES,
    };
    const withFields = (metrics: string[], dimensions: string[]) => {
        const version = getDocumentChartVersion(chart);
        return {
            ...version,
            metricQuery: {
                ...version.metricQuery,
                metrics,
                dimensions,
                tableCalculations: [],
            },
        };
    };

    it('names the chart after its first metric by its first dimension', () => {
        expect(
            getDefaultDocumentChartName(
                withFields(['orders_count'], ['orders_date']),
                explore,
            ),
        ).toBe('Order count by Order date');
    });

    it('uses the only selected field when the other kind is missing', () => {
        expect(
            getDefaultDocumentChartName(
                withFields(['orders_count'], []),
                explore,
            ),
        ).toBe('Order count');
        expect(
            getDefaultDocumentChartName(
                withFields([], ['orders_date']),
                explore,
            ),
        ).toBe('Order date');
    });

    it('falls back to the table, then a generic name', () => {
        expect(getDefaultDocumentChartName(withFields([], []), explore)).toBe(
            'Orders',
        );
        expect(
            getDefaultDocumentChartName(
                withFields(['orders_count'], ['orders_date']),
                null,
            ),
        ).toBe('Untitled chart');
    });
});
