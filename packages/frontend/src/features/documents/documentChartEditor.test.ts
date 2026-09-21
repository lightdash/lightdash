import {
    ChartType,
    FilterOperator,
    type SemanticChartAsCode,
} from '@lightdash/common';
import {
    buildDocumentChartEditorState,
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

it('refuses custom visualization types instead of silently truncating their configuration', () => {
    const version = getDocumentChartVersion(chart);
    expect(
        getDocumentChartFromVersion(
            { ...version, chartConfig: { type: ChartType.DATA_APP_VIZ } },
            'Custom',
            '',
        ),
    ).toBeNull();
});
