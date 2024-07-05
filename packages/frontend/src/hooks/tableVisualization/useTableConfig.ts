import {
    FieldType,
    getItemLabel,
    isDimension,
    isField,
    isMetric,
    isTableCalculation,
    itemsInMetricQuery,
    type ApiQueryResults,
    type ColumnProperties,
    type ConditionalFormattingConfig,
    type DashboardFilters,
    type ItemsMap,
    type PivotData,
    type ResultRow,
    type TableChart,
} from '@lightdash/common';
import { createWorkerFactory, useWorker } from '@shopify/react-web-worker';
import uniq from 'lodash/uniq';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    type TableColumn,
    type TableHeader,
} from '../../components/common/Table/types';
import { useCalculateTotal } from '../useCalculateTotal';
import { isSummable } from '../useColumnTotals';
import getDataAndColumns from './getDataAndColumns';

const createWorker = createWorkerFactory(
    () => import('../pivotTable/pivotQueryResults'),
);

const useTableConfig = (
    tableChartConfig: TableChart | undefined,
    resultsData: ApiQueryResults | undefined,
    itemsMap: ItemsMap | undefined,
    columnOrder: string[],
    pivotDimensions: string[] | undefined,
    pivotTableMaxColumnLimit: number,
    savedChartUuid?: string,
    dashboardFilters?: DashboardFilters,
    invalidateCache?: boolean,
) => {
    const [showColumnCalculation, setShowColumnCalculation] = useState<boolean>(
        !!tableChartConfig?.showColumnCalculation,
    );

    const [showRowCalculation, setShowRowCalculation] = useState<boolean>(
        !!tableChartConfig?.showRowCalculation,
    );

    const [conditionalFormattings, setConditionalFormattings] = useState<
        ConditionalFormattingConfig[]
    >(tableChartConfig?.conditionalFormattings ?? []);

    const [showTableNames, setShowTableNames] = useState<boolean>(
        tableChartConfig?.showTableNames === undefined
            ? true
            : tableChartConfig.showTableNames,
    );
    const [showResultsTotal, setShowResultsTotal] = useState<boolean>(
        tableChartConfig?.showResultsTotal ?? false,
    );
    const [showSubtotals, setShowSubtotals] = useState<boolean>(
        tableChartConfig?.showSubtotals ?? false,
    );
    const [hideRowNumbers, setHideRowNumbers] = useState<boolean>(
        tableChartConfig?.hideRowNumbers === undefined
            ? false
            : tableChartConfig.hideRowNumbers,
    );

    const [metricsAsRows, setMetricsAsRows] = useState<boolean>(
        tableChartConfig?.metricsAsRows || false,
    );

    useEffect(() => {
        if (
            tableChartConfig?.showTableNames === undefined &&
            itemsMap !== undefined
        ) {
            const hasItemsFromMultipleTables =
                Object.values(itemsMap).reduce<string[]>((acc, item) => {
                    if (isField(item)) {
                        acc.push(item.table);
                    }
                    return uniq(acc);
                }, []).length > 0;
            if (hasItemsFromMultipleTables) {
                setShowTableNames(true);
            }
        }
    }, [itemsMap, tableChartConfig?.showTableNames]);

    const [columnProperties, setColumnProperties] = useState<
        Record<string, ColumnProperties>
    >(tableChartConfig?.columns === undefined ? {} : tableChartConfig?.columns);

    const selectedItemIds = useMemo(() => {
        return resultsData
            ? itemsInMetricQuery(resultsData.metricQuery)
            : undefined;
    }, [resultsData]);

    const getFieldLabelDefault = useCallback(
        (fieldId: string | null | undefined) => {
            if (!fieldId || !itemsMap || !(fieldId in itemsMap))
                return undefined;

            const item = itemsMap[fieldId];

            if (isField(item) && !showTableNames) {
                return item.label;
            } else {
                return getItemLabel(item);
            }
        },
        [itemsMap, showTableNames],
    );

    const getFieldLabelOverride = useCallback(
        (fieldId: string | null | undefined) => {
            return fieldId ? columnProperties[fieldId]?.name : undefined;
        },
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

    // This is controlled by the state in this component.
    // User configures the names and visibilty of these in the config panel
    const isColumnVisible = useCallback(
        (fieldId: string) => {
            // we should always show dimensions when pivoting
            // hiding a dimension randomly removes values from all metrics
            if (
                pivotDimensions &&
                pivotDimensions.length > 0 &&
                isDimension(getField(fieldId))
            ) {
                return true;
            }

            return columnProperties[fieldId]?.visible ?? true;
        },
        [pivotDimensions, getField, columnProperties],
    );
    const isColumnFrozen = useCallback(
        (fieldId: string) => columnProperties[fieldId]?.frozen === true,
        [columnProperties],
    );

    const isPivotTableEnabled =
        resultsData?.metricQuery &&
        resultsData.metricQuery.metrics.length > 0 &&
        resultsData.rows.length &&
        pivotDimensions &&
        pivotDimensions.length > 0;

    const dimensions = useMemo(() => {
        if (!itemsMap) return [];

        return columnOrder.filter((fieldId) => {
            const item = itemsMap[fieldId];
            return item && isField(item)
                ? item.fieldType === FieldType.DIMENSION
                : false;
        });
    }, [columnOrder, itemsMap]);

    const canUseSubtotals = dimensions.length > 1;

    const { data: totalCalculations } = useCalculateTotal(
        savedChartUuid
            ? {
                  savedChartUuid,
                  fieldIds: selectedItemIds,
                  dashboardFilters,
                  invalidateCache,
                  itemsMap,
                  showColumnCalculation:
                      tableChartConfig?.showColumnCalculation,
              }
            : {
                  metricQuery: resultsData?.metricQuery,
                  explore: resultsData?.metricQuery?.exploreName,
                  fieldIds: selectedItemIds,
                  itemsMap,
                  showColumnCalculation:
                      tableChartConfig?.showColumnCalculation,
              },
    );
    const { rows, columns, error } = useMemo<{
        rows: ResultRow[];
        columns: Array<TableColumn | TableHeader>;
        error?: string;
    }>(() => {
        if (!resultsData) {
            return {
                rows: [],
                columns: [],
            };
        }

        if (pivotDimensions && pivotDimensions.length > 0) {
            return {
                rows: [],
                columns: [],
            };
        }

        return getDataAndColumns({
            itemsMap,
            selectedItemIds,
            resultsData,
            isColumnVisible,
            showTableNames,
            getFieldLabelOverride,
            isColumnFrozen,
            columnOrder,
            totals: totalCalculations,
        });
    }, [
        resultsData,
        selectedItemIds,
        itemsMap,
        pivotDimensions,
        isColumnVisible,
        showTableNames,
        getFieldLabelOverride,
        isColumnFrozen,
        columnOrder,
        totalCalculations,
    ]);

    console.log({ rows, columns, error });

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

    useEffect(() => {
        if (
            !pivotDimensions ||
            pivotDimensions.length === 0 ||
            !resultsData ||
            resultsData.rows.length === 0
        ) {
            setPivotTableData({
                loading: false,
                data: undefined,
                error: undefined,
            });
            return;
        }

        setPivotTableData({
            loading: true,
            data: undefined,
            error: undefined,
        });

        const hiddenMetricFieldIds = selectedItemIds?.filter((fieldId) => {
            const field = getField(fieldId);

            return (
                !isColumnVisible(fieldId) &&
                field &&
                ((isField(field) && isMetric(field)) ||
                    isTableCalculation(field))
            );
        });

        const summableMetricFieldIds = selectedItemIds?.filter((fieldId) => {
            const field = getField(fieldId);

            if (isDimension(field)) {
                return false;
            }

            if (
                hiddenMetricFieldIds &&
                hiddenMetricFieldIds.includes(fieldId)
            ) {
                return false;
            }

            return isSummable(field);
        });

        worker
            .pivotQueryResults({
                pivotConfig: {
                    pivotDimensions,
                    metricsAsRows,
                    columnOrder,
                    hiddenMetricFieldIds,
                    summableMetricFieldIds,
                    columnTotals: tableChartConfig?.showColumnCalculation,
                    rowTotals: tableChartConfig?.showRowCalculation,
                },
                metricQuery: resultsData.metricQuery ?? {},
                rows: resultsData.rows,
                options: {
                    maxColumns: pivotTableMaxColumnLimit,
                },
            })
            .then((data) => {
                setPivotTableData({
                    loading: false,
                    data: data,
                    error: undefined,
                });
            })
            .catch((e) => {
                setPivotTableData({
                    loading: false,
                    data: undefined,
                    error: e.message,
                });
            });
    }, [
        resultsData,
        pivotDimensions,
        columnOrder,
        metricsAsRows,
        selectedItemIds,
        isColumnVisible,
        getField,
        tableChartConfig?.showColumnCalculation,
        tableChartConfig?.showRowCalculation,
        worker,
        pivotTableMaxColumnLimit,
    ]);

    // Remove columnProperties from map if the column has been removed from results
    useEffect(() => {
        if (Object.keys(columnProperties).length > 0 && selectedItemIds) {
            const newColumnProperties: Record<string, ColumnProperties> =
                Object.keys(columnProperties).reduce(
                    (acc, field) =>
                        selectedItemIds.includes(field)
                            ? {
                                  ...acc,
                                  [field]: columnProperties[field],
                              }
                            : acc,
                    {},
                );
            // only update if something changed, otherwise we get into an infinite loop
            if (
                Object.keys(columnProperties).length !==
                Object.keys(newColumnProperties).length
            ) {
                setColumnProperties(newColumnProperties);
            }
        }
    }, [selectedItemIds, columnProperties]);

    const updateColumnProperty = useCallback(
        (field: string, properties: Partial<ColumnProperties>) => {
            const newProperties =
                field in columnProperties
                    ? { ...columnProperties[field], ...properties }
                    : {
                          ...properties,
                      };
            setColumnProperties({
                ...columnProperties,
                [field]: newProperties,
            });
        },
        [columnProperties],
    );

    const handleSetConditionalFormattings = useCallback(
        (configs: ConditionalFormattingConfig[]) => {
            setConditionalFormattings(configs);
        },
        [],
    );

    const validConfig: TableChart = useMemo(
        () => ({
            showColumnCalculation,
            showRowCalculation,
            showTableNames,
            showResultsTotal,
            showSubtotals,
            columns: columnProperties,
            hideRowNumbers,
            conditionalFormattings,
            metricsAsRows,
        }),
        [
            showColumnCalculation,
            showRowCalculation,
            hideRowNumbers,
            showTableNames,
            showResultsTotal,
            showSubtotals,
            columnProperties,
            conditionalFormattings,
            metricsAsRows,
        ],
    );

    return {
        selectedItemIds,
        columnOrder,
        validConfig,
        showColumnCalculation,
        setShowColumnCalculation,
        showRowCalculation,
        setShowRowCalculation,
        showTableNames,
        setShowTableNames,
        hideRowNumbers,
        setHideRowNumbers,
        showResultsTotal,
        setShowResultsTotal,
        showSubtotals,
        setShowSubtotals,
        columnProperties,
        setColumnProperties,
        updateColumnProperty,
        rows,
        error,
        columns,
        getFieldLabelOverride,
        getFieldLabelDefault,
        getFieldLabel,
        getField,
        isColumnVisible,
        isColumnFrozen,
        conditionalFormattings,
        onSetConditionalFormattings: handleSetConditionalFormattings,
        pivotTableData,
        metricsAsRows,
        setMetricsAsRows,
        isPivotTableEnabled,
        canUseSubtotals,
    };
};

export default useTableConfig;
