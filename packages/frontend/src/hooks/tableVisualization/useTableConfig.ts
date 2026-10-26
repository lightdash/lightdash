import {
    getMergeColumnTotals,
    QueryHistoryStatus,
    type ColumnProperties,
    type ConditionalFormattingConfig,
    type ConditionalFormattingMinMaxMap,
    type ItemsMap,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotData,
    type RowLimit,
    type TableChart,
} from '@lightdash/common';
import {
    buildTablePivotInput,
    calculateConditionalFormattingMinMaxMap,
    canUseTableSubtotals,
    getFieldsNeedingMinMax,
    getNumUnpivotedDimensions,
    getRowTotalIndexFieldIds,
    getTableColumnWidth,
    getTableDimensions,
    getTableFieldLabelDefault,
    getTableFieldLabelOverride,
    getTableSelectedItemIds,
    hasTotalableColumns as getHasTotalableColumns,
    isPivotResultStale as getIsPivotResultStale,
    isPivotTableEnabled as getIsPivotTableEnabled,
    isTableColumnFrozen,
    isTableColumnVisible,
    pruneTableColumnProperties,
    resolvePivotRowFieldIds,
    shouldDefaultShowTableNames,
    shouldDisableMetricsAsRows,
    shouldDisableSubtotals,
} from '@lightdash/visualization/editor';
import { createWorkerFactory, useWorker } from '@shopify/react-web-worker';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type SetStateAction,
} from 'react';
import { useMergeSafe } from '../../features/mergeQuery/context/useMerge';
import {
    buildTableEditorState,
    selectTableEditor,
    tableEditorActions,
    useEditorFieldSetter,
    useEditorState,
    useVisualizationDispatch,
    type TableEditorState,
} from '../../features/visualization/store';
import {
    useAsyncCalculateGrandTotal,
    useAsyncCalculateRowSubtotals,
    useAsyncCalculateRowTotal,
    useAsyncCalculateSubtotals,
    useAsyncCalculateTotal,
} from '../useAsyncCalculateTotal';
import { useProjectUuid } from '../useProjectUuid';
import { type InfiniteQueryResults } from '../useQueryResults';
import getDataAndColumns from './getDataAndColumns';

const createWorker = createWorkerFactory(
    () => import('@lightdash/common/src/pivot/pivotQueryResults'),
);

const useTableConfig = (
    tableChartConfig: TableChart | undefined,
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
              resolvedTimezone?: string;
          })
        | undefined,
    itemsMap: ItemsMap | undefined,
    columnOrder: string[],
    pivotDimensions: string[] | undefined,
    pivotRows: string[] | undefined,
    onPivotRowsChange?: (value: string[] | undefined) => void,
    invalidateCache?: boolean,
    parameters?: ParametersValuesMap,
) => {
    const {
        showColumnCalculation,
        showRowCalculation,
        conditionalFormattings,
        showTableNames,
        showResultsTotal,
        showSubtotals,
        showSubtotalsExpanded,
        showRowGrouping,
        hideRowNumbers,
        metricsAsRows,
        rowLimit,
        columnProperties,
    } = useEditorState(selectTableEditor, tableEditorActions, () =>
        buildTableEditorState(tableChartConfig),
    );
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<TableEditorState>(
        selectTableEditor,
        tableEditorActions.set,
    );

    const setters = useMemo(
        () => ({
            setShowColumnCalculation: (value: SetStateAction<boolean>) =>
                set('showColumnCalculation', value),
            setShowRowCalculation: (value: SetStateAction<boolean>) =>
                set('showRowCalculation', value),
            setShowTableNames: (value: SetStateAction<boolean>) =>
                set('showTableNames', value),
            setHideRowNumbers: (value: SetStateAction<boolean>) =>
                set('hideRowNumbers', value),
            setShowResultsTotal: (value: SetStateAction<boolean>) =>
                set('showResultsTotal', value),
            setShowSubtotals: (value: SetStateAction<boolean>) =>
                set('showSubtotals', value),
            setShowSubtotalsExpanded: (value: SetStateAction<boolean>) =>
                set('showSubtotalsExpanded', value),
            setShowRowGrouping: (value: SetStateAction<boolean>) =>
                set('showRowGrouping', value),
            setMetricsAsRows: (value: SetStateAction<boolean>) =>
                set('metricsAsRows', value),
            setRowLimit: (value: SetStateAction<RowLimit | undefined>) =>
                set('rowLimit', value),
            setColumnProperties: (
                value: SetStateAction<Record<string, ColumnProperties>>,
            ) => set('columnProperties', value),
        }),
        [set],
    );

    useEffect(() => {
        if (
            tableChartConfig?.showTableNames === undefined &&
            itemsMap !== undefined
        ) {
            const hasItemsFromMultipleTables =
                shouldDefaultShowTableNames(itemsMap);
            if (hasItemsFromMultipleTables) {
                set('showTableNames', true);
            }
        }
    }, [itemsMap, tableChartConfig?.showTableNames, set]);

    const selectedItemIds = useMemo(
        () => getTableSelectedItemIds(resultsData?.metricQuery),
        [resultsData?.metricQuery],
    );

    const rowFieldIds = useMemo(
        () =>
            resolvePivotRowFieldIds({
                selectedItemIds,
                itemsMap,
                pivotDimensions,
                columnOrder,
                pivotRows,
            }),
        [selectedItemIds, itemsMap, pivotDimensions, columnOrder, pivotRows],
    );

    const disableMetricsAsRows = shouldDisableMetricsAsRows({
        metricsAsRows,
        selectedItemIds: selectedItemIds?.filter(
            (fieldId) => columnProperties[fieldId]?.visible !== false,
        ),
        rowFieldIds,
        itemsMap,
    });
    const effectiveMetricsAsRows = metricsAsRows && !disableMetricsAsRows;

    useEffect(() => {
        if (disableMetricsAsRows) set('metricsAsRows', false);
    }, [disableMetricsAsRows, set]);

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

    const isPivotTableEnabled = getIsPivotTableEnabled(
        resultsData,
        pivotDimensions,
    );

    // True when the configured pivot dimensions differ from the ones the current
    // results were computed with (warehouse pivots key on groupByColumns). Mirrors
    // the mismatch check in VisualizationWarning so a re-run is needed.
    const isPivotResultStale = useMemo(
        () =>
            getIsPivotResultStale(
                pivotDimensions,
                resultsData?.pivotDetails?.groupByColumns,
                isColumnVisible,
            ),
        [
            pivotDimensions,
            resultsData?.pivotDetails?.groupByColumns,
            isColumnVisible,
        ],
    );

    const dimensions = useMemo(
        () => getTableDimensions(columnOrder, itemsMap),
        [columnOrder, itemsMap],
    );

    const numUnpivotedDimensions = getNumUnpivotedDimensions(
        dimensions,
        pivotDimensions,
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
    const canUseSubtotals = useMemo(
        () => canUseTableSubtotals(numUnpivotedDimensions, isMerged),
        [numUnpivotedDimensions, isMerged],
    );

    // Once dimensions are loaded, turn off subtotals if there are not enough dimensions.
    useEffect(() => {
        if (shouldDisableSubtotals(dimensions.length, numUnpivotedDimensions))
            set('showSubtotals', false);
    }, [dimensions.length, numUnpivotedDimensions, set]);

    const projectUuid = useProjectUuid();
    // Only request totals once the initial query has succeeded — a queryUuid can
    // exist for a query that errored, and totals against that are meaningless.
    const isInitialQueryReady =
        resultsData?.queryStatus === QueryHistoryStatus.READY;
    // A dimension-only table has nothing the warehouse can total; skip the
    // request instead of letting the backend refuse it.
    const hasTotalableColumns = useMemo(
        () => getHasTotalableColumns(columnOrder, itemsMap),
        [columnOrder, itemsMap],
    );
    const canFetchAsyncTotals =
        isInitialQueryReady &&
        !!resultsData?.queryUuid &&
        hasTotalableColumns &&
        !!tableChartConfig?.showColumnCalculation;
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
        !!tableChartConfig?.showRowCalculation &&
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
        !!tableChartConfig?.showColumnCalculation &&
        !!tableChartConfig?.showRowCalculation;
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
            !!tableChartConfig?.showRowCalculation &&
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
            isMergedResult:
                isMerged && !!tableChartConfig?.showColumnCalculation,
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
        tableChartConfig?.showColumnCalculation,
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
                showColumnCalculation: tableChartConfig?.showColumnCalculation,
                showRowCalculation: tableChartConfig?.showRowCalculation,
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
            tableChartConfig?.showColumnCalculation,
            tableChartConfig?.showRowCalculation,
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

    // Remove columnProperties from map if the column has been removed from results
    useEffect(() => {
        if (Object.keys(columnProperties).length > 0 && selectedItemIds) {
            const newColumnProperties = pruneTableColumnProperties(
                columnProperties,
                selectedItemIds,
            );
            // only update if something changed, otherwise we get into an infinite loop
            if (
                Object.keys(columnProperties).length !==
                Object.keys(newColumnProperties).length
            ) {
                set('columnProperties', newColumnProperties);
            }
        }
    }, [selectedItemIds, columnProperties, set]);

    const updateColumnProperty = useCallback(
        (field: string, properties: Partial<ColumnProperties>) =>
            dispatch(
                tableEditorActions.updateColumnProperty({ field, properties }),
            ),
        [dispatch],
    );

    const handleSetConditionalFormattings = useCallback(
        (configs: ConditionalFormattingConfig[]) =>
            set('conditionalFormattings', configs),
        [set],
    );

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

    const exposedColumnProperties = columnProperties;

    const validConfig: TableChart = useMemo(
        () => ({
            showColumnCalculation,
            showRowCalculation,
            showTableNames,
            showResultsTotal,
            showSubtotals,
            showSubtotalsExpanded,
            showRowGrouping,
            columns: columnProperties,
            hideRowNumbers,
            conditionalFormattings,
            metricsAsRows: effectiveMetricsAsRows,
            rowLimit,
        }),
        [
            showColumnCalculation,
            showRowCalculation,
            hideRowNumbers,
            showTableNames,
            showResultsTotal,
            showSubtotals,
            showSubtotalsExpanded,
            showRowGrouping,
            columnProperties,
            conditionalFormattings,
            effectiveMetricsAsRows,
            rowLimit,
        ],
    );

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

            columnProperties: exposedColumnProperties,
            updateColumnProperty,
            columns,
            getFieldLabelOverride,
            getFieldLabelDefault,
            getFieldLabel,
            getField,
            isColumnVisible,
            isColumnFrozen,
            minMaxMap,
            conditionalFormattings,
            onSetConditionalFormattings: handleSetConditionalFormattings,
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
            ...setters,
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

            exposedColumnProperties,
            updateColumnProperty,
            columns,
            getFieldLabelOverride,
            getFieldLabelDefault,
            getFieldLabel,
            getField,
            isColumnVisible,
            isColumnFrozen,
            minMaxMap,
            conditionalFormattings,
            handleSetConditionalFormattings,
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
            setters,
        ],
    );
};

export default useTableConfig;
