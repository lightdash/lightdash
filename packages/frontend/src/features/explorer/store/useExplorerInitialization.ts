import { type SavedChart } from '@lightdash/common';
import { useEffect, useRef } from 'react';
import {
    defaultQueryExecution,
    defaultState,
} from '../../../providers/Explorer/defaultState';
import {
    ExplorerSection,
    type ExplorerReduceState,
} from '../../../providers/Explorer/types';
import { explorerActions } from './explorerSlice';
import { useExplorerDispatch } from './hooks';

interface ExplorerInitializationOptions {
    savedChart?: SavedChart;
    isEditMode?: boolean;
    expandedSections?: ExplorerSection[];
    minimal?: boolean;
    // For advanced use cases (like chart history), pass complete initial state
    initialState?: Partial<ExplorerReduceState>;
    // Default limit from health config - applied only when no savedChart or initialState provided
    defaultLimit?: number;
}

/**
 * Hook to initialize Redux store for Explorer
 * Derives initial state from savedChart when available, uses defaults otherwise
 *
 * @param options.savedChart - Saved chart to initialize from
 * @param options.isEditMode - Whether to start in edit mode (default: false)
 * @param options.expandedSections - Which sections to expand (default: [VISUALIZATION])
 * @param options.minimal - Whether this is a minimal explorer (default: false)
 * @param options.initialState - Advanced: Pass complete initial state (for chart history, etc.)
 * @param options.defaultLimit - Default query limit from health config (only applied when no savedChart/initialState)
 */
export const useExplorerInitialization = ({
    savedChart,
    isEditMode = false,
    expandedSections = [ExplorerSection.VISUALIZATION],
    minimal = false,
    initialState: customInitialState,
    defaultLimit,
}: ExplorerInitializationOptions) => {
    const dispatch = useExplorerDispatch();
    const hasInitialized = useRef(false);

    useEffect(() => {
        // Only initialize once when component mounts
        if (!hasInitialized.current) {
            let stateToUse;

            if (customInitialState) {
                // Advanced use case: use custom initial state directly
                // Apply defaultLimit only if limit is not already set in initialState
                const baseState = {
                    ...defaultState,
                    ...customInitialState,
                    isEditMode,
                };

                // Apply defaultLimit to metricQuery if provided and not already set
                if (
                    defaultLimit !== undefined &&
                    baseState.unsavedChartVersion
                ) {
                    stateToUse = {
                        ...baseState,
                        unsavedChartVersion: {
                            ...baseState.unsavedChartVersion,
                            metricQuery: {
                                ...baseState.unsavedChartVersion.metricQuery,
                                limit:
                                    baseState.unsavedChartVersion.metricQuery
                                        .limit || defaultLimit,
                            },
                        },
                    };
                } else {
                    stateToUse = baseState;
                }
            } else if (savedChart) {
                // When we have a savedChart, derive state from it
                // Use savedChart's limit, don't override with defaultLimit
                stateToUse = {
                    ...defaultState,
                    isEditMode,
                    isMinimal: minimal,
                    parameterReferences: Object.keys(
                        savedChart.parameters ?? {},
                    ),
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
                                ...baseDefaultState.unsavedChartVersion
                                    .metricQuery,
                                limit: defaultLimit,
                            },
                        },
                    };
                } else {
                    stateToUse = baseDefaultState;
                }
            }

            dispatch(explorerActions.reset(stateToUse));
            hasInitialized.current = true;
        }
    }, [
        savedChart,
        isEditMode,
        minimal,
        expandedSections,
        customInitialState,
        defaultLimit,
        dispatch,
    ]);

    // Set savedChart in Redux (separate from initialState for reactivity)
    // This handles the case where data loads after component mounts
    useEffect(() => {
        dispatch(explorerActions.setSavedChart(savedChart));
    }, [savedChart, dispatch]);

    return hasInitialized.current;
};
