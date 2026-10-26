import {
    getMergeColumnTotals,
    QueryHistoryStatus,
    type ColumnProperties,
    type ConditionalFormattingConfig,
    type ConditionalFormattingMinMaxMap,
    type PivotData,
    type RowLimit,
} from '@lightdash/common';
import {
    buildTablePivotInput,
    calculateConditionalFormattingMinMaxMap,
    getFieldsNeedingMinMax,
    getRowTotalIndexFieldIds,
    getTableColumnWidth,
    getTableFieldLabelDefault,
    getTableFieldLabelOverride,
    isTableColumnFrozen,
    isTableColumnVisible,
} from '@lightdash/visualization/editor';
import { createWorkerFactory, useWorker } from '@shopify/react-web-worker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
    useVisualizationInputsRef,
} from '../../components/LightdashVisualization/useVisualizationContext';
import { useMergeSafe } from '../../features/mergeQuery/context/useMerge';
import {
    selectTableCanUseSubtotals,
    selectTableColumnProperties,
    selectTableEditor,
    selectTableHasTotalableColumns,
    selectTableIsPivotResultStale,
    selectTableIsPivotTableEnabled,
    selectTableMetricsAsRows,
    selectTableRowFieldIds,
    selectTableSelectedItemIds,
    selectTableShowSubtotals,
    selectTableShowTableNames,
    selectTableValidConfig,
    tableEditorActions,
    useEditorFieldSetter,
    useVisualizationDispatch,
    useVisualizationSelector,
    useVisualizationStore,
    type TableEditorState,
    type TableToggleKey,
} from '../../features/visualization/store';
import {
    useAsyncCalculateGrandTotal,
    useAsyncCalculateRowSubtotals,
    useAsyncCalculateRowTotal,
    useAsyncCalculateSubtotals,
    useAsyncCalculateTotal,
} from '../useAsyncCalculateTotal';
import { useProjectUuid } from '../useProjectUuid';
import getDataAndColumns from './getDataAndColumns';

const createWorker = createWorkerFactory(
    () => import('@lightdash/common/src/pivot/pivotQueryResults'),
);

export type TableEditorActions = {
    updateColumnProperty: (
        field: string,
        properties: Partial<ColumnProperties>,
    ) => void;
    onSetConditionalFormattings: (
        configs: ConditionalFormattingConfig[],
    ) => void;
    toggle: (key: TableToggleKey) => void;
    toggleShowTableNames: () => void;
    setMetricsAsRows: (value: boolean) => void;
    setRowLimit: (value: RowLimit | undefined) => void;
};

/** Stable table editor actions; the derived show-table-names is read at call time. */
export const useTableEditorActions = (): TableEditorActions => {
    const dispatch = useVisualizationDispatch();
    const store = useVisualizationStore();
    const inputsRef = useVisualizationInputsRef();
    const set = useEditorFieldSetter<TableEditorState>(tableEditorActions.set);
    return useMemo(
        () => ({
            updateColumnProperty: (field, properties) =>
                dispatch(
                    tableEditorActions.updateColumnProperty({
                        field,
                        properties,
                    }),
                ),
            onSetConditionalFormattings: (configs) =>
                set('conditionalFormattings', configs),
            toggle: (key) => dispatch(tableEditorActions.toggle(key)),
            toggleShowTableNames: () =>
                set(
                    'showTableNames',
                    !selectTableShowTableNames(
                        store.getState(),
                        inputsRef.current,
                    ),
                ),
            setMetricsAsRows: (value) => set('metricsAsRows', value),
            setRowLimit: (value) => set('rowLimit', value),
        }),
        [dispatch, store, inputsRef, set],
    );
};

/** Subtotals need two un-pivoted dimensions and a query that is not a merge */
export const useTableCanUseSubtotals = (): boolean => {
    const canUseSubtotals = useVisualizationInputSelector(
        selectTableCanUseSubtotals,
    );
    const isMerged = !!useMergeSafe()?.mergeResults;
    return canUseSubtotals && !isMerged;
};

/**
 * Everything the table body reads; re-renders on every edit. Config panels
 * select the fields they show instead.
 */
const useTableConfig = (
    onPivotRowsChange?: (value: string[] | undefined) => void,
) => {
    const {
        resultsData,
        itemsMap,
        columnOrder,
        pivotDimensions,
        initialPivotRows: pivotRows,
        invalidateCache,
        parameters,
    } = useVisualizationInputs();
    const {
        showColumnCalculation,
        showRowCalculation,
        conditionalFormattings,
        showResultsTotal,
        showSubtotalsExpanded,
        showRowGrouping,
        hideRowNumbers,
        rowLimit,
    } = useVisualizationSelector(selectTableEditor);
    const showTableNames = useVisualizationInputSelector(
        selectTableShowTableNames,
    );
    const showSubtotals = useVisualizationInputSelector(
        selectTableShowSubtotals,
    );
    const columnProperties = useVisualizationInputSelector(
        selectTableColumnProperties,
    );
    const effectiveMetricsAsRows = useVisualizationInputSelector(
        selectTableMetricsAsRows,
    );
    const selectedItemIds = useVisualizationInputSelector(
        selectTableSelectedItemIds,
    );
    const rowFieldIds = useVisualizationInputSelector(selectTableRowFieldIds);
    const isPivotTableEnabled = useVisualizationInputSelector(
        selectTableIsPivotTableEnabled,
    );
    const isPivotResultStale = useVisualizationInputSelector(
        selectTableIsPivotResultStale,
    );
    const hasTotalableColumns = useVisualizationInputSelector(
        selectTableHasTotalableColumns,
    );
    const validConfig = useVisualizationInputSelector(selectTableValidConfig);
    const actions = useTableEditorActions();

    const getFieldLabelDefault = useCallback(
        (fieldId: string | null | undefined) =>
            getTableFieldLabelDefault(itemsMap, showTableNames, fieldId),
        [itemsMap, showTableNames],
    );

    const getFieldLabelOverride = useCallback(
        (fieldId: string | null | undefined) =>
            getTableFieldLabelOverride(columnProperties, fieldId),
        [columnProperties],
    );

    const getField = useCallback(
        (fieldId: string) => itemsMap && itemsMap[fieldId],
        [itemsMap],
    );

    const getFieldLabel = useCallback(
        (fieldId: string | null | undefined) => {
            return (
                getFieldLabelOverride(fieldId) || getFieldLabelDefault(fieldId)
            );
        },
        [getFieldLabelOverride, getFieldLabelDefault],
    );

    const isColumnVisible = useCallback(
        (fieldId: string) => isTableColumnVisible(columnProperties, fieldId),
        [columnProperties],
    );
    const isColumnFrozen = useCallback(
        (fieldId: string) => isTableColumnFrozen(columnProperties, fieldId),
        [columnProperties],
    );

    const getColumnWidth = useCallback(
        (fieldId: string) => getTableColumnWidth(columnProperties, fieldId),
        [columnProperties],
    );

    // Subtotals re-derive from the metric query behind the source query. A
    // merge has no such query — its metric query describes the merged result
    // rather than anything the warehouse can be asked to group again.
    const mergeResults = useMergeSafe()?.mergeResults ?? null;
    const isMerged = !!mergeResults;
    const mergeColumnTotals = useMemo(
        () =>
            mergeResults
                ? getMergeColumnTotals({
                      mergeQuery: mergeResults.mergeQuery,
                      fieldIds: mergeResults.columnOrder,
                      itemsMap: mergeResults.fields,
                  })
                : {},
        [mergeResults],
    );
    const canUseSubtotals = useTableCanUseSubtotals();

    const projectUuid = useProjectUuid();
    // Only request totals once the initial query has succeeded — a queryUuid can
    // exist for a query that errored, and totals against that are meaningless.
    const isInitialQueryReady =
        resultsData?.queryStatus === QueryHistoryStatus.READY;
    const canFetchAsyncTotals =
        isInitialQueryReady &&
        !!resultsData?.queryUuid &&
        hasTotalableColumns &&
        !!showColumnCalculation;
    const {
        data: asyncTotals,
        error: columnTotalsError,
        isFetching: isCalculatingColumnTotals,
    } = useAsyncCalculateTotal({
        projectUuid,
        sourceQueryUuid: resultsData?.queryUuid,
        enabled: canFetchAsyncTotals,
        invalidateCache,
    });

    // Index dimension field ids the warehouse row-total query groups by — the
    // worker keys each rendered row's total by these. Row totals are exclusively
    // warehouse-computed (no client-side fallback) for SQL pivots, in both the
    // metrics-as-columns and metrics-as-rows layouts.
    const rowTotalIndexFieldIds = useMemo<string[]>(
        () => getRowTotalIndexFieldIds(resultsData?.pivotDetails?.indexColumn),
        [resultsData?.pivotDetails?.indexColumn],
    );
    const canFetchAsyncRowTotals =
        isInitialQueryReady &&
        !!resultsData?.queryUuid &&
        hasTotalableColumns &&
        !!showRowCalculation &&
        !!resultsData?.pivotDetails;
    const {
        data: asyncRowTotals,
        error: rowTotalsError,
        isFetching: isCalculatingRowTotals,
    } = useAsyncCalculateRowTotal({
        projectUuid,
        sourceQueryUuid: resultsData?.queryUuid,
        indexFieldIds: rowTotalIndexFieldIds,
        enabled: canFetchAsyncRowTotals,
        invalidateCache,
    });

    const canFetchAsyncGrandTotals =
        isInitialQueryReady &&
        !!resultsData?.queryUuid &&
        hasTotalableColumns &&
        !!resultsData?.pivotDetails &&
        !!showColumnCalculation &&
        !!showRowCalculation;
    const {
        data: asyncGrandTotals,
        error: grandTotalsError,
        isFetching: isCalculatingGrandTotals,
    } = useAsyncCalculateGrandTotal({
        projectUuid,
        sourceQueryUuid: resultsData?.queryUuid,
        enabled: canFetchAsyncGrandTotals,
        invalidateCache,
    });

    const {
        data: groupedSubtotals,
        error: columnSubtotalsError,
        isFetching: isCalculatingSubtotals,
    } = useAsyncCalculateSubtotals({
        projectUuid,
        sourceQueryUuid: resultsData?.queryUuid,
        dimensions: resultsData?.metricQuery?.dimensions,
        columnOrder,
        pivotDimensions,
        enabled:
            isInitialQueryReady &&
            hasTotalableColumns &&
            showSubtotals &&
            canUseSubtotals,
        invalidateCache,
    });
    const {
        data: groupedRowSubtotals,
        error: rowSubtotalsError,
        isFetching: isCalculatingRowSubtotals,
    } = useAsyncCalculateRowSubtotals({
        projectUuid,
        sourceQueryUuid: resultsData?.queryUuid,
        dimensions: resultsData?.metricQuery?.dimensions,
        columnOrder,
        pivotDimensions,
        enabled:
            isInitialQueryReady &&
            hasTotalableColumns &&
            showSubtotals &&
            canUseSubtotals &&
            !!showRowCalculation &&
            (pivotDimensions?.length ?? 0) > 0,
        invalidateCache,
    });

    const columns = useMemo(() => {
        if (!selectedItemIds || !itemsMap) {
            return [];
        }

        if (pivotDimensions && pivotDimensions.length > 0) {
            return [];
        }

        return getDataAndColumns({
            itemsMap,
            selectedItemIds,
            isColumnVisible,
            showTableNames,
            getFieldLabelOverride,
            isColumnFrozen,
            getColumnWidth,
            columnOrder,
            totals: asyncTotals,
            totalsLoading: isCalculatingColumnTotals,
            totalsError: columnTotalsError,
            isMergedResult: isMerged && !!showColumnCalculation,
            mergeColumnTotals,
            groupedSubtotals,
            subtotalsLoading: isCalculatingSubtotals,
            subtotalsError: columnSubtotalsError,
            parameters,
        });
    }, [
        columnOrder,
        selectedItemIds,
        pivotDimensions,
        itemsMap,
        isColumnVisible,
        showTableNames,
        isColumnFrozen,
        getColumnWidth,
        getFieldLabelOverride,
        asyncTotals,
        isMerged,
        mergeColumnTotals,
        showColumnCalculation,
        isCalculatingColumnTotals,
        columnTotalsError,
        groupedSubtotals,
        isCalculatingSubtotals,
        columnSubtotalsError,
        parameters,
    ]);
    const worker = useWorker(createWorker);
    const [pivotTableData, setPivotTableData] = useState<{
        loading: boolean;
        data: PivotData | undefined;
        error: undefined | string;
    }>({
        loading: false,
        data: undefined,
        error: undefined,
    });
    const pivotWorkerRequestIdRef = useRef(0);

    const pivotWorkerInput = useMemo(
        () =>
            buildTablePivotInput({
                pivotDimensions,
                rows: resultsData?.rows,
                metricQuery: resultsData?.metricQuery,
                pivotDetails: resultsData?.pivotDetails,
                selectedItemIds,
                getField,
                getFieldLabel,
                isColumnVisible,
                metricsAsRows: effectiveMetricsAsRows,
                rowFieldIds,
                columnOrder,
                showColumnCalculation: showColumnCalculation,
                showRowCalculation: showRowCalculation,
                groupedSubtotals,
                groupedRowSubtotals,
                warehouseRowTotals: asyncRowTotals,
                warehouseColumnTotals: asyncTotals,
                warehouseGrandTotals: asyncGrandTotals,
                parameters,
            }),
        [
            pivotDimensions,
            resultsData?.metricQuery,
            resultsData?.rows,
            resultsData?.pivotDetails,
            effectiveMetricsAsRows,
            rowFieldIds,
            columnOrder,
            selectedItemIds,
            getField,
            getFieldLabel,
            isColumnVisible,
            showColumnCalculation,
            showRowCalculation,
            groupedSubtotals,
            groupedRowSubtotals,
            asyncRowTotals,
            asyncTotals,
            asyncGrandTotals,
            parameters,
        ],
    );

    useEffect(() => {
        const currentRequestId = ++pivotWorkerRequestIdRef.current;

        if (!pivotWorkerInput) {
            setPivotTableData((prevState) => {
                if (
                    !prevState.loading &&
                    prevState.data === undefined &&
                    prevState.error === undefined
                ) {
                    return prevState;
                }
                return {
                    loading: false,
                    data: undefined,
                    error: undefined,
                };
            });
            return;
        }

        setPivotTableData((prevState) => ({
            ...prevState,
            loading: true,
            error: undefined,
        }));

        worker
            .convertSqlPivotedRowsToPivotData(pivotWorkerInput)
            .then((data) => {
                if (currentRequestId === pivotWorkerRequestIdRef.current) {
                    setPivotTableData({
                        loading: false,
                        data,
                        error: undefined,
                    });
                }
            })
            .catch((e) => {
                if (currentRequestId === pivotWorkerRequestIdRef.current) {
                    setPivotTableData({
                        loading: false,
                        data: undefined,
                        error: e.message,
                    });
                }
            });
    }, [worker, pivotWorkerInput]);

    // Unlike isPivotTableEnabled, true for pivots without metrics (e.g. only
    // table calculations), which still render PivotTable and its totals.
    const rendersPivotTable = pivotWorkerInput !== null;

    const prevMinMaxQueryUuidRef = useRef<string | undefined>(undefined);
    const prevMinMaxFieldsRef = useRef<string>('');
    const cachedMinMaxMapRef = useRef<
        ConditionalFormattingMinMaxMap | undefined
    >(undefined);

    const minMaxMap = useMemo(() => {
        if (!itemsMap || !resultsData || resultsData.rows.length === 0) {
            return undefined;
        }

        // Step 1: Identify which fields need min/max calculation
        const fieldsNeedingMinMax = getFieldsNeedingMinMax(
            conditionalFormattings,
            columnProperties,
        );

        if (fieldsNeedingMinMax.size === 0) {
            prevMinMaxQueryUuidRef.current = resultsData.queryUuid;
            prevMinMaxFieldsRef.current = '';
            cachedMinMaxMapRef.current = undefined;
            return undefined;
        }

        // Step 2: Check cache - avoid recalculation if query and fields haven't changed
        const currentQueryUuid = resultsData.queryUuid;
        const currentFieldsKey = Array.from(fieldsNeedingMinMax)
            .sort()
            .join(',');

        if (
            currentQueryUuid &&
            currentQueryUuid === prevMinMaxQueryUuidRef.current &&
            currentFieldsKey === prevMinMaxFieldsRef.current &&
            cachedMinMaxMapRef.current !== undefined
        ) {
            return cachedMinMaxMapRef.current;
        }

        // Steps 3-5: map fields to their result columns, collect values, min/max
        const finalResult = calculateConditionalFormattingMinMaxMap({
            fieldsNeedingMinMax,
            itemsMap,
            resultsData,
            isColumnVisible,
        });

        // Step 6: Update cache
        prevMinMaxQueryUuidRef.current = currentQueryUuid;
        prevMinMaxFieldsRef.current = currentFieldsKey;
        cachedMinMaxMapRef.current = finalResult;

        return finalResult;
    }, [
        conditionalFormattings,
        columnProperties,
        isColumnVisible,
        itemsMap,
        resultsData,
    ]);

    return useMemo(
        () => ({
            selectedItemIds,
            columnOrder,
            validConfig,
            showColumnCalculation,
            showRowCalculation,
            showTableNames,
            hideRowNumbers,
            showResultsTotal,
            showSubtotals,
            showSubtotalsExpanded,
            showRowGrouping,

            columnProperties,
            columns,
            getFieldLabelOverride,
            getFieldLabelDefault,
            getFieldLabel,
            getField,
            isColumnVisible,
            isColumnFrozen,
            minMaxMap,
            conditionalFormattings,
            pivotTableData,
            metricsAsRows: effectiveMetricsAsRows,
            rowFieldIds,
            configuredRowFieldIds: pivotRows,
            setRowFieldIds: onPivotRowsChange,
            isPivotTableEnabled,
            rendersPivotTable,
            isPivotResultStale,
            canUseSubtotals,
            groupedSubtotals,
            columnTotalsError,
            rowTotalsError,
            grandTotalsError,
            columnSubtotalsError,
            rowSubtotalsError,
            isCalculatingColumnTotals,
            isCalculatingRowTotals,
            isCalculatingRowSubtotals,
            isCalculatingGrandTotals,
            isCalculatingSubtotals,
            rowLimit,
            ...actions,
        }),
        [
            selectedItemIds,
            columnOrder,
            validConfig,
            showColumnCalculation,
            showRowCalculation,
            showTableNames,
            hideRowNumbers,
            showResultsTotal,
            showSubtotals,
            showSubtotalsExpanded,
            showRowGrouping,

            columnProperties,
            columns,
            getFieldLabelOverride,
            getFieldLabelDefault,
            getFieldLabel,
            getField,
            isColumnVisible,
            isColumnFrozen,
            minMaxMap,
            conditionalFormattings,
            pivotTableData,
            effectiveMetricsAsRows,
            rowFieldIds,
            pivotRows,
            onPivotRowsChange,
            isPivotTableEnabled,
            rendersPivotTable,
            isPivotResultStale,
            canUseSubtotals,
            groupedSubtotals,
            columnTotalsError,
            rowTotalsError,
            grandTotalsError,
            columnSubtotalsError,
            rowSubtotalsError,
            isCalculatingColumnTotals,
            isCalculatingRowTotals,
            isCalculatingRowSubtotals,
            isCalculatingGrandTotals,
            isCalculatingSubtotals,
            rowLimit,
            actions,
        ],
    );
};

export default useTableConfig;
