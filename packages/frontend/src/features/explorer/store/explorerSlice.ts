import {
    getItemId,
    toggleArrayValue,
    type AdditionalMetric,
    type ChartConfig,
    type CustomDimension,
    type CustomFormat,
    type Dimension,
    type FieldId,
    type Item,
    type Metric,
    type MetricQuery,
    type MetricType,
    type ParameterValue,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { type QueryResultsProps } from '../../../hooks/useQueryResults';
import { defaultState } from '../../../providers/Explorer/defaultState';
import {
    type ExplorerReduceState,
    type ExplorerSection,
} from '../../../providers/Explorer/types';
import { calcColumnOrder } from './utils';

export type ExplorerSliceState = ExplorerReduceState;

const initialState: ExplorerSliceState = defaultState;

const explorerSlice = createSlice({
    name: 'explorer',
    initialState,
    reducers: {
        reset: (state, action: PayloadAction<ExplorerSliceState>) => {
            return action.payload;
        },
        setTableName: (state, action: PayloadAction<string>) => {
            state.unsavedChartVersion.tableName = action.payload;
            state.unsavedChartVersion.metricQuery.exploreName = action.payload;
        },
        setIsEditMode: (state, action: PayloadAction<boolean>) => {
            state.isEditMode = action.payload;
        },
        setPreviouslyFetchedState: (
            state,
            action: PayloadAction<MetricQuery>,
        ) => {
            state.previouslyFetchedState = action.payload;
        },

        toggleExpandedSection: (
            state,
            action: PayloadAction<ExplorerSection>,
        ) => {
            const index = state.expandedSections.indexOf(action.payload);
            if (index > -1) {
                state.expandedSections.splice(index, 1);
            } else {
                state.expandedSections.push(action.payload);
            }
        },

        setFilters: (state, action: PayloadAction<MetricQuery['filters']>) => {
            state.unsavedChartVersion.metricQuery.filters = action.payload;
        },

        setSortFields: (state, action: PayloadAction<SortField[]>) => {
            state.unsavedChartVersion.metricQuery.sorts = action.payload;
        },

        setDimensions: (state, action: PayloadAction<string[]>) => {
            state.unsavedChartVersion.metricQuery.dimensions = action.payload;
        },
        setMetrics: (state, action: PayloadAction<string[]>) => {
            state.unsavedChartVersion.metricQuery.metrics = action.payload;
        },

        toggleDimension: (state, action: PayloadAction<FieldId>) => {
            const fieldId = action.payload;
            const currentDimensions =
                state.unsavedChartVersion.metricQuery.dimensions;

            state.unsavedChartVersion.metricQuery.dimensions = toggleArrayValue(
                currentDimensions,
                fieldId,
            );

            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (s) => s.fieldId !== fieldId,
                );

            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
                dimensionIds,
            );
        },

        toggleMetric: (state, action: PayloadAction<FieldId>) => {
            const fieldId = action.payload;
            const currentMetrics =
                state.unsavedChartVersion.metricQuery.metrics;

            state.unsavedChartVersion.metricQuery.metrics = toggleArrayValue(
                currentMetrics,
                fieldId,
            );

            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (s) => s.fieldId !== fieldId,
                );

            state.unsavedChartVersion.metricQuery.metricOverrides =
                Object.fromEntries(
                    Object.entries(
                        state.unsavedChartVersion.metricQuery.metricOverrides ||
                            {},
                    ).filter(([key]) =>
                        state.unsavedChartVersion.metricQuery.metrics.includes(
                            key,
                        ),
                    ),
                );

            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
            );
        },

        removeField: (state, action: PayloadAction<FieldId>) => {
            const fieldToRemove = action.payload;

            state.unsavedChartVersion.metricQuery.dimensions =
                state.unsavedChartVersion.metricQuery.dimensions.filter(
                    (fieldId) => fieldId !== fieldToRemove,
                );

            state.unsavedChartVersion.metricQuery.metrics =
                state.unsavedChartVersion.metricQuery.metrics.filter(
                    (fieldId) => fieldId !== fieldToRemove,
                );

            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (s) => s.fieldId !== fieldToRemove,
                );

            state.unsavedChartVersion.metricQuery.tableCalculations =
                state.unsavedChartVersion.metricQuery.tableCalculations.filter(
                    (tc) => tc.name !== fieldToRemove,
                );

            state.unsavedChartVersion.tableConfig.columnOrder =
                state.unsavedChartVersion.tableConfig.columnOrder.filter(
                    (fieldId) => fieldId !== fieldToRemove,
                );

            state.unsavedChartVersion.metricQuery.customDimensions = (
                state.unsavedChartVersion.metricQuery.customDimensions || []
            ).filter((cd) => cd.id !== fieldToRemove);

            state.unsavedChartVersion.metricQuery.additionalMetrics = (
                state.unsavedChartVersion.metricQuery.additionalMetrics || []
            ).filter((am) => getItemId(am) !== fieldToRemove);
        },

        setRowLimit: (state, action: PayloadAction<number>) => {
            state.unsavedChartVersion.metricQuery.limit = action.payload;
        },

        setColumnOrder: (state, action: PayloadAction<string[]>) => {
            state.unsavedChartVersion.tableConfig.columnOrder = action.payload;
        },

        setPivotConfig: (
            state,
            action: PayloadAction<{ columns: string[] } | undefined>,
        ) => {
            state.unsavedChartVersion.pivotConfig = action.payload;
        },

        setParameter: (
            state,
            action: PayloadAction<{
                key: string;
                value: ParameterValue | null;
            }>,
        ) => {
            const { key, value } = action.payload;
            if (!state.unsavedChartVersion.parameters) {
                state.unsavedChartVersion.parameters = {};
            }
            if (value === null || value === undefined) {
                delete state.unsavedChartVersion.parameters[key];
            } else {
                state.unsavedChartVersion.parameters[key] = value;
            }
        },

        clearAllParameters: (state) => {
            state.unsavedChartVersion.parameters = {};
        },

        setParameterReferences: (
            state,
            action: PayloadAction<string[] | null>,
        ) => {
            state.parameterReferences = action.payload;
        },

        setParameterDefinitions: (
            state,
            action: PayloadAction<ExplorerReduceState['parameterDefinitions']>,
        ) => {
            state.parameterDefinitions = action.payload;
        },

        openVisualizationConfig: (state) => {
            state.isVisualizationConfigOpen = true;
        },
        closeVisualizationConfig: (state) => {
            state.isVisualizationConfigOpen = false;
        },

        toggleCustomDimensionModal: (
            state,
            action: PayloadAction<
                | {
                      isEditing: boolean;
                      table?: string;
                      item?: Dimension | CustomDimension;
                  }
                | undefined
            >,
        ) => {
            state.modals.customDimension = {
                isOpen: !state.modals.customDimension.isOpen,
                ...(action.payload && { ...action.payload }),
            };
        },
        toggleAdditionalMetricModal: (
            state,
            action: PayloadAction<
                | {
                      type?: MetricType;
                      item?: Dimension | AdditionalMetric | CustomDimension;
                      isEditing: boolean;
                  }
                | undefined
            >,
        ) => {
            state.modals.additionalMetric = {
                isOpen: !state.modals.additionalMetric.isOpen,
                ...(action.payload && { ...action.payload }),
            };
        },
        toggleWriteBackModal: (
            state,
            action: PayloadAction<
                { items?: CustomDimension[] | AdditionalMetric[] } | undefined
            >,
        ) => {
            state.modals.writeBack = {
                isOpen: !state.modals.writeBack.isOpen,
                ...(action.payload && { ...action.payload }),
            };
        },
        toggleFormatModal: (
            state,
            action: PayloadAction<{ metric?: Metric } | undefined>,
        ) => {
            state.modals.format = {
                isOpen: !state.modals.format.isOpen,
                ...(action.payload && { ...action.payload }),
            };
        },
        updateMetricFormat: (
            state,
            action: PayloadAction<{
                metric: Metric;
                formatOptions: CustomFormat | undefined;
            }>,
        ) => {
            const { metric, formatOptions } = action.payload;
            const metricId = getItemId(metric);
            if (!state.unsavedChartVersion.metricQuery.metricOverrides) {
                state.unsavedChartVersion.metricQuery.metricOverrides = {};
            }
            state.unsavedChartVersion.metricQuery.metricOverrides[metricId] = {
                formatOptions,
            };
        },
        openItemDetail: (
            state,
            action: PayloadAction<{
                itemType: 'field' | 'table' | 'group';
                label: string;
                description?: string;
                fieldItem?: Item | AdditionalMetric;
            }>,
        ) => {
            state.modals.itemDetail = {
                isOpen: true,
                itemType: action.payload.itemType,
                label: action.payload.label,
                description: action.payload.description,
                fieldItem: action.payload.fieldItem,
            };
        },
        closeItemDetail: (state) => {
            state.modals.itemDetail = {
                isOpen: false,
                itemType: undefined,
                label: undefined,
                description: undefined,
                fieldItem: undefined,
            };
        },

        // Chart config
        setChartConfig: (state, action: PayloadAction<ChartConfig>) => {
            state.unsavedChartVersion.chartConfig = action.payload;
        },

        // Table calculations
        addTableCalculation: (
            state,
            action: PayloadAction<TableCalculation>,
        ) => {
            state.unsavedChartVersion.metricQuery.tableCalculations.push(
                action.payload,
            );

            // Update columnOrder to include new table calculation
            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
            );
        },
        updateTableCalculation: (
            state,
            action: PayloadAction<{
                oldName: string;
                tableCalculation: TableCalculation;
            }>,
        ) => {
            const { oldName, tableCalculation } = action.payload;
            const newName = tableCalculation.name;

            // Update table calculation
            const index =
                state.unsavedChartVersion.metricQuery.tableCalculations.findIndex(
                    (tc) => tc.name === oldName,
                );
            if (index > -1) {
                state.unsavedChartVersion.metricQuery.tableCalculations[index] =
                    tableCalculation;
            }

            // Update sorts to use new name
            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.map((field) =>
                    field.fieldId === oldName
                        ? { ...field, fieldId: newName }
                        : field,
                );

            // Update column order to use new name
            state.unsavedChartVersion.tableConfig.columnOrder =
                state.unsavedChartVersion.tableConfig.columnOrder.map(
                    (column) => (column === oldName ? newName : column),
                );
        },
        deleteTableCalculation: (state, action: PayloadAction<string>) => {
            const nameToRemove = action.payload;
            state.unsavedChartVersion.metricQuery.tableCalculations =
                state.unsavedChartVersion.metricQuery.tableCalculations.filter(
                    (tc) => tc.name !== nameToRemove,
                );

            // Remove any sorts referencing this table calculation
            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (sort) => sort.fieldId !== nameToRemove,
                );

            // Recalculate columnOrder to remove deleted table calculation
            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
            );
        },
        setTableCalculations: (
            state,
            action: PayloadAction<TableCalculation[]>,
        ) => {
            state.unsavedChartVersion.metricQuery.tableCalculations =
                action.payload;
        },

        addCustomDimension: (state, action: PayloadAction<CustomDimension>) => {
            const newCustomDimension = action.payload;

            if (!state.unsavedChartVersion.metricQuery.customDimensions) {
                state.unsavedChartVersion.metricQuery.customDimensions = [];
            }
            state.unsavedChartVersion.metricQuery.customDimensions.push(
                newCustomDimension,
            );

            const customDimensionId = getItemId(newCustomDimension);
            if (
                !state.unsavedChartVersion.metricQuery.dimensions.includes(
                    customDimensionId,
                )
            ) {
                state.unsavedChartVersion.metricQuery.dimensions.push(
                    customDimensionId,
                );
            }

            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
                dimensionIds,
            );
        },
        updateCustomDimension: (
            state,
            action: PayloadAction<{
                oldId: string;
                customDimension: CustomDimension;
            }>,
        ) => {
            const { oldId, customDimension } = action.payload;
            if (!state.unsavedChartVersion.metricQuery.customDimensions) {
                state.unsavedChartVersion.metricQuery.customDimensions = [];
                return;
            }

            const index =
                state.unsavedChartVersion.metricQuery.customDimensions.findIndex(
                    (cd) => cd.id === oldId,
                );
            if (index > -1) {
                state.unsavedChartVersion.metricQuery.customDimensions[index] =
                    customDimension;
            }

            const newId = getItemId(customDimension);
            if (oldId !== newId) {
                state.unsavedChartVersion.metricQuery.dimensions =
                    state.unsavedChartVersion.metricQuery.dimensions.map(
                        (dim) => (dim === oldId ? newId : dim),
                    );

                state.unsavedChartVersion.metricQuery.sorts =
                    state.unsavedChartVersion.metricQuery.sorts.map((sort) =>
                        sort.fieldId === oldId
                            ? { ...sort, fieldId: newId }
                            : sort,
                    );

                state.unsavedChartVersion.tableConfig.columnOrder =
                    state.unsavedChartVersion.tableConfig.columnOrder.map(
                        (col) => (col === oldId ? newId : col),
                    );
            }
        },
        removeCustomDimension: (state, action: PayloadAction<string>) => {
            const idToRemove = action.payload;
            if (!state.unsavedChartVersion.metricQuery.customDimensions) {
                return;
            }
            state.unsavedChartVersion.metricQuery.customDimensions =
                state.unsavedChartVersion.metricQuery.customDimensions.filter(
                    (cd) => cd.id !== idToRemove,
                );

            state.unsavedChartVersion.metricQuery.dimensions =
                state.unsavedChartVersion.metricQuery.dimensions.filter(
                    (dimension) => dimension !== idToRemove,
                );

            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (sort) => sort.fieldId !== idToRemove,
                );

            state.unsavedChartVersion.tableConfig.columnOrder =
                state.unsavedChartVersion.tableConfig.columnOrder.filter(
                    (fieldId) => fieldId !== idToRemove,
                );
        },
        setCustomDimensions: (
            state,
            action: PayloadAction<CustomDimension[] | undefined>,
        ) => {
            state.unsavedChartVersion.metricQuery.customDimensions =
                action.payload;
        },

        setAdditionalMetrics: (
            state,
            action: PayloadAction<AdditionalMetric[] | undefined>,
        ) => {
            state.unsavedChartVersion.metricQuery.additionalMetrics =
                action.payload;
        },
        addAdditionalMetric: (
            state,
            action: PayloadAction<AdditionalMetric>,
        ) => {
            const newMetric = action.payload;
            const isMetricAlreadyInList = (
                state.unsavedChartVersion.metricQuery.additionalMetrics || []
            ).find((metric) => getItemId(metric) === getItemId(newMetric));

            if (!isMetricAlreadyInList) {
                state.unsavedChartVersion.metricQuery.additionalMetrics = [
                    ...(state.unsavedChartVersion.metricQuery
                        .additionalMetrics || []),
                    newMetric,
                ];
            }

            const metricId = getItemId(newMetric);
            if (
                !state.unsavedChartVersion.metricQuery.metrics.includes(
                    metricId,
                )
            ) {
                state.unsavedChartVersion.metricQuery.metrics.push(metricId);
            }

            const dimensionIds =
                state.unsavedChartVersion.metricQuery.dimensions;
            const metricIds = state.unsavedChartVersion.metricQuery.metrics;
            const calcIds =
                state.unsavedChartVersion.metricQuery.tableCalculations.map(
                    ({ name }) => name,
                );

            state.unsavedChartVersion.tableConfig.columnOrder = calcColumnOrder(
                state.unsavedChartVersion.tableConfig.columnOrder,
                [...dimensionIds, ...metricIds, ...calcIds],
            );
        },
        updateAdditionalMetric: (
            state,
            action: PayloadAction<{
                oldId: string;
                additionalMetric: AdditionalMetric;
            }>,
        ) => {
            const { oldId, additionalMetric } = action.payload;
            const newId = getItemId(additionalMetric);

            state.unsavedChartVersion.metricQuery.additionalMetrics = (
                state.unsavedChartVersion.metricQuery.additionalMetrics || []
            ).map((metric) =>
                getItemId(metric) === oldId ? additionalMetric : metric,
            );

            if (oldId !== newId) {
                state.unsavedChartVersion.metricQuery.metrics =
                    state.unsavedChartVersion.metricQuery.metrics.map(
                        (metric) => (metric === oldId ? newId : metric),
                    );

                state.unsavedChartVersion.metricQuery.sorts =
                    state.unsavedChartVersion.metricQuery.sorts.map((sort) =>
                        sort.fieldId === oldId
                            ? { ...sort, fieldId: newId }
                            : sort,
                    );

                state.unsavedChartVersion.tableConfig.columnOrder =
                    state.unsavedChartVersion.tableConfig.columnOrder.map(
                        (col) => (col === oldId ? newId : col),
                    );
            }
        },
        removeAdditionalMetric: (state, action: PayloadAction<string>) => {
            const metricIdToRemove = action.payload;

            state.unsavedChartVersion.metricQuery.additionalMetrics = (
                state.unsavedChartVersion.metricQuery.additionalMetrics || []
            ).filter((metric) => getItemId(metric) !== metricIdToRemove);

            state.unsavedChartVersion.metricQuery.metrics =
                state.unsavedChartVersion.metricQuery.metrics.filter(
                    (metric) => metric !== metricIdToRemove,
                );

            state.unsavedChartVersion.metricQuery.sorts =
                state.unsavedChartVersion.metricQuery.sorts.filter(
                    (sort) => sort.fieldId !== metricIdToRemove,
                );

            state.unsavedChartVersion.tableConfig.columnOrder =
                state.unsavedChartVersion.tableConfig.columnOrder.filter(
                    (fieldId) => fieldId !== metricIdToRemove,
                );
        },

        setValidQueryArgs: (
            state,
            action: PayloadAction<QueryResultsProps | null>,
        ) => {
            state.queryExecution.validQueryArgs = action.payload;
        },
        setUnpivotedQueryArgs: (
            state,
            action: PayloadAction<QueryResultsProps | null>,
        ) => {
            state.queryExecution.unpivotedQueryArgs = action.payload;
        },
        setQueryUuidHistory: (state, action: PayloadAction<string[]>) => {
            state.queryExecution.queryUuidHistory = action.payload;
        },
        addQueryUuid: (state, action: PayloadAction<string>) => {
            state.queryExecution.queryUuidHistory.push(action.payload);
        },
        setUnpivotedQueryUuidHistory: (
            state,
            action: PayloadAction<string[]>,
        ) => {
            state.queryExecution.unpivotedQueryUuidHistory = action.payload;
        },
        addUnpivotedQueryUuid: (state, action: PayloadAction<string>) => {
            state.queryExecution.unpivotedQueryUuidHistory.push(action.payload);
        },
        resetQueryExecution: (state) => {
            state.queryExecution = {
                validQueryArgs: null,
                unpivotedQueryArgs: null,
                queryUuidHistory: [],
                unpivotedQueryUuidHistory: [],
            };
        },
    },
});

export const explorerActions = explorerSlice.actions;
export const explorerReducer = explorerSlice.reducer;
