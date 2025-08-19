import {
    type BigNumberConfig,
    type CartesianChartConfig,
    CartesianSeriesType,
    ChartType,
    Compact,
    ComparisonFormatTypes,
    type CreateSavedChartVersion,
    type CustomDimension,
    CustomDimensionType,
    type CustomFormat,
    CustomFormatType,
    DimensionType,
    type FieldId,
    FieldType,
    type FilterGroup,
    FilterOperator,
    type Metric,
    type MetricQuery,
    MetricType,
    type SortField,
    type TableCalculation,
    type TableChartConfig,
} from '@lightdash/common';
import { defaultState } from '../Explorer/defaultState';
import type { ExplorerReduceState } from '../Explorer/types';

/**
 * A valid empty FilterGroup to satisfy reducer expectations.
 */
export const emptyFilterGroup = (): FilterGroup => ({
    id: 'test-filter-group',
    and: [],
});

/**
 * Returns a valid MetricQuery object with some overrides.
 */
export const mockMetricQuery = (
    overrides: Partial<MetricQuery> = {},
): MetricQuery => ({
    exploreName: '',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
    timezone: undefined,
    ...overrides,
});

/**
 * Returns a valid ExplorerReduceState with optional overrides.
 */
export const mockExplorerState = (
    overrides: Partial<ExplorerReduceState> = {},
): ExplorerReduceState => {
    const defaultChartVersion = defaultState.unsavedChartVersion;

    return {
        ...defaultState,
        ...overrides,
        modals: {
            ...defaultState.modals,
            ...overrides.modals,
        },
        unsavedChartVersion: {
            ...defaultChartVersion,
            ...overrides.unsavedChartVersion,
            chartConfig:
                overrides.unsavedChartVersion?.chartConfig ??
                defaultChartVersion.chartConfig,
            tableConfig:
                overrides.unsavedChartVersion?.tableConfig ??
                defaultChartVersion.tableConfig,
            metricQuery: {
                ...defaultChartVersion.metricQuery,
                ...overrides.unsavedChartVersion?.metricQuery,
            },
        },
    };
};

/**
 * Simple helper to build a sort field.
 */
export const mockSortField = (
    fieldId: FieldId,
    descending = false,
): SortField => ({
    fieldId,
    descending,
});

/**
 * Simple helper to build a table calculation.
 */
export const mockTableCalculation = (
    name: string,
    sql = '1 + 1',
): TableCalculation => ({
    name,
    displayName: name,
    sql,
});

/**
 * Chart config mock for non-default chart types.
 */
export const mockBigNumberConfig: BigNumberConfig = {
    type: ChartType.BIG_NUMBER,
    config: {
        label: 'Total Revenue',
        selectedField: 'revenue',
        showBigNumberLabel: true,
        showComparison: true,
        comparisonFormat: ComparisonFormatTypes.PERCENTAGE,
        flipColors: false,
    },
};

export const mockTableChartConfig: TableChartConfig = {
    type: ChartType.TABLE,
    config: {
        hideRowNumbers: false,
        showTableNames: true,
        showColumnCalculation: false,
        conditionalFormattings: [],
        columns: {
            revenue: {
                visible: true,
                name: 'Revenue',
            },
        },
    },
};

export const mockCartesianChartConfig: CartesianChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'date',
            yField: ['revenue'],
            showGridX: true,
        },
        eChartsConfig: {
            series: [
                {
                    type: CartesianSeriesType.LINE,
                    encode: {
                        xRef: { field: 'date' },
                        yRef: { field: 'revenue' },
                    },
                },
            ],
            xAxis: [{ name: 'Date' }],
            yAxis: [{ name: 'Revenue' }],
        },
    },
};

export const mockTableConfig: CreateSavedChartVersion['tableConfig'] = {
    columnOrder: ['revenue', 'date'],
};

export const mockFormatOptions: CustomFormat = {
    type: CustomFormatType.CUSTOM,
    compact: Compact.THOUSANDS,
};

export const metricOverrides = {
    formatOptions: mockFormatOptions,
};

export const mockFilterGroup = (
    overrides?: Partial<FilterGroup>,
): FilterGroup => ({
    id: 'mock-group',
    and: [
        {
            id: 'mock-rule',
            target: { fieldId: 'mock_field' },
            operator: FilterOperator.EQUALS,
            values: ['mock-value'],
        },
    ],
    ...overrides,
});

export const mockAdditionalMetric: Metric = {
    tableLabel: 'orders',
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    sql: '${TABLE}.revenue',
    type: MetricType.SUM,
    fieldType: FieldType.METRIC,
    hidden: false,
};

export const mockCustomDimension: CustomDimension = {
    id: 'custom-dim-1',
    name: 'is_high_value',
    table: 'orders',
    type: CustomDimensionType.SQL,
    sql: '${TABLE}.revenue > 1000',
    dimensionType: DimensionType.BOOLEAN,
};

export const mockUpdatedDimension: CustomDimension = {
    ...mockCustomDimension,
    id: 'custom-dim-1-new',
    name: 'is_very_high_value',
    sql: '${TABLE}.revenue > 5000',
};
