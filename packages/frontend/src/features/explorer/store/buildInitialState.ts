import { type SavedChart } from '@lightdash/common';
import {
    defaultQueryExecution,
    defaultState,
} from '../../../providers/Explorer/defaultState';
import {
    ExplorerSection,
    type ExplorerReduceState,
} from '../../../providers/Explorer/types';

interface BuildInitialStateOptions {
    savedChart?: SavedChart;
    isEditMode?: boolean;
    expandedSections?: ExplorerSection[];
    minimal?: boolean;
    initialState?: Partial<ExplorerReduceState>;
    defaultLimit?: number;
}

/**
 * Build initial Redux state for Explorer
 */
export const buildInitialExplorerState = ({
    savedChart,
    isEditMode = false,
    expandedSections = [ExplorerSection.VISUALIZATION],
    minimal = false,
    initialState: customInitialState,
    defaultLimit,
}: BuildInitialStateOptions): ExplorerReduceState => {
    let stateToUse: ExplorerReduceState;

    if (customInitialState) {
        // Use custom initial state
        const baseState = {
            ...defaultState,
            ...customInitialState,
            isEditMode,
        };

        // Apply defaultLimit to metricQuery if provided and not already set
        if (defaultLimit !== undefined && baseState.unsavedChartVersion) {
            stateToUse = {
                ...baseState,
                unsavedChartVersion: {
                    ...baseState.unsavedChartVersion,
                    metricQuery: {
                        ...baseState.unsavedChartVersion.metricQuery,
                        limit:
                            baseState.unsavedChartVersion.metricQuery.limit ||
                            defaultLimit,
                    },
                },
            };
        } else {
            stateToUse = baseState;
        }
    } else if (savedChart) {
        // When we have a savedChart, derive state from it
        stateToUse = {
            ...defaultState,
            savedChart,
            isEditMode,
            isMinimal: minimal,
            parameterReferences: Object.keys(savedChart.parameters ?? {}),
            parameterDefinitions: {},
            expandedSections,
            unsavedChartVersion: {
                tableName: savedChart.tableName,
                chartConfig: savedChart.chartConfig,
                metricQuery: savedChart.metricQuery,
                tableConfig: savedChart.tableConfig,
                pivotConfig: savedChart.pivotConfig,
                parameters: savedChart.parameters,
            },
            modals: defaultState.modals,
            queryExecution: defaultQueryExecution,
        };
    } else {
        // When no savedChart, use defaults with optional defaultLimit
        const baseDefaultState = {
            ...defaultState,
            isEditMode,
            isMinimal: minimal,
            expandedSections,
        };

        // Apply defaultLimit if provided
        if (defaultLimit !== undefined) {
            stateToUse = {
                ...baseDefaultState,
                unsavedChartVersion: {
                    ...baseDefaultState.unsavedChartVersion,
                    metricQuery: {
                        ...baseDefaultState.unsavedChartVersion.metricQuery,
                        limit: defaultLimit,
                    },
                },
            };
        } else {
            stateToUse = baseDefaultState;
        }
    }

    // Initialize cache with current chart config
    stateToUse.cachedChartConfigs = {
        [stateToUse.unsavedChartVersion.chartConfig.type]: {
            chartConfig: stateToUse.unsavedChartVersion.chartConfig.config,
            pivotConfig: stateToUse.unsavedChartVersion.pivotConfig,
        },
    };

    return stateToUse;
};
