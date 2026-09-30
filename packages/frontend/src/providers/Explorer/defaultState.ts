import { ChartType, type Filters } from '@lightdash/common';
import type { ExplorerSliceState } from '../../features/explorer/store/explorerSlice';
import { ExplorerSection } from './types';
import { createEmptyTableChartConfig } from './utils';

// Helper to create default query execution state
export const defaultQueryExecution: ExplorerSliceState['queryExecution'] = {
    validQueryArgs: null,
    unpivotedQueryArgs: null,
    queryUuidHistory: [],
    unpivotedQueryUuidHistory: [],
    pendingFetch: false,
};

const defaultFilters: Filters = {};

export const defaultState: ExplorerSliceState = {
    isVisualizationConfigOpen: false,
    chartSidebarStep: 'configure',
    chartTypeAuthoring: null,
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
            type: ChartType.TABLE,
            config: createEmptyTableChartConfig(),
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
        periodOverPeriodComparison: {
            isOpen: false,
        },
    },
    unsavedColorPaletteUuid: null,
    queryExecution: defaultQueryExecution,
    preAggregate: {
        usePreAggregateCache: true,
        check: {
            status: 'idle',
        },
    },
};
