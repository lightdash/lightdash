import { ChartType } from '@lightdash/common';
import { EMPTY_CARTESIAN_CHART_CONFIG } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { ExplorerSection, type ExplorerReduceState } from './types';

// Helper to create default query execution state
export const defaultQueryExecution: ExplorerReduceState['queryExecution'] = {
    validQueryArgs: null,
    unpivotedQueryArgs: null,
    queryUuidHistory: [],
    unpivotedQueryUuidHistory: [],
};

export const defaultState: ExplorerReduceState = {
    isVisualizationConfigOpen: false,
    parameterReferences: [],
    parameterDefinitions: {},
    previouslyFetchedState: undefined,
    expandedSections: [ExplorerSection.RESULTS, ExplorerSection.PARAMETERS],
    unsavedChartVersion: {
        tableName: '',
        metricQuery: {
            exploreName: '',
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            timezone: undefined,
        },
        pivotConfig: undefined,
        tableConfig: {
            columnOrder: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: EMPTY_CARTESIAN_CHART_CONFIG,
        },
    },
    modals: {
        format: {
            isOpen: false,
        },
        additionalMetric: {
            isOpen: false,
        },
        customDimension: {
            isOpen: false,
        },
        writeBack: {
            isOpen: false,
        },
        itemDetail: {
            isOpen: false,
        },
    },
    queryExecution: defaultQueryExecution,
};
