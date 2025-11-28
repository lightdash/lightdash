import { ChartType, type Filters } from '@lightdash/common';
import type { ExplorerSliceState } from '../../features/explorer/store/explorerSlice';
import { EMPTY_CARTESIAN_CHART_CONFIG } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { ExplorerSection } from './types';

// Helper to create default query execution state
export const defaultQueryExecution: ExplorerSliceState['queryExecution'] = {
    validQueryArgs: null,
    unpivotedQueryArgs: null,
    queryUuidHistory: [],
    unpivotedQueryUuidHistory: [],
    pendingFetch: false,
    completeColumnOrder: [],
};

const defaultFilters: Filters = {};

export const defaultState: ExplorerSliceState = {
    isVisualizationConfigOpen: false,
    isEditMode: false,
    isMinimal: false,
    parameterReferences: [],
    parameterDefinitions: {},
    previouslyFetchedState: undefined,
    cachedChartConfigs: {},
    expandedSections: [ExplorerSection.RESULTS, ExplorerSection.PARAMETERS],
    unsavedChartVersion: {
        tableName: '',
        metricQuery: {
            exploreName: '',
            dimensions: [],
            metrics: [],
            filters: defaultFilters,
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
