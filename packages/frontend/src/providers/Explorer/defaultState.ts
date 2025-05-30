import { ChartType } from '@lightdash/common';
import { EMPTY_CARTESIAN_CHART_CONFIG } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { ExplorerSection, type ExplorerReduceState } from './types';

export const defaultState: ExplorerReduceState = {
    shouldFetchResults: false,
    previouslyFetchedState: undefined,
    expandedSections: [ExplorerSection.RESULTS],
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
    },
};
