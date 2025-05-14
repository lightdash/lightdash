import {
    convertFormattedValue,
    getItemLabel,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableItem,
    isMetric,
    isNumericItem,
    isTableCalculation,
    itemsInMetricQuery,
    type ColumnProperties,
    type ConditionalFormattingConfig,
    type ConditionalFormattingMinMaxMap,
    type DashboardFilters,
    type ItemsMap,
    type MetricQuery,
    type PivotData,
    type TableChart,
} from '@lightdash/common';
import { createWorkerFactory, useWorker } from '@shopify/react-web-worker';
import { uniq } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import { useCalculateSubtotals } from '../useCalculateSubtotals';
import { useCalculateTotal } from '../useCalculateTotal';
import { type InfiniteQueryResults } from '../useQueryResults';
import getDataAndColumns from './getDataAndColumns';

const createWorker = createWorkerFactory(
    () => import('@lightdash/common/src/pivotTable/pivotQueryResults'),
);

const useTableConfig = (
    tableChartConfig: TableChart | undefined,
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
          })
        | undefined,
    itemsMap: ItemsMap | undefined,
    columnOrder: string[],
    pivotDimensions: string[] | undefined,
    pivotTableMaxColumnLimit: number,
    savedChartUuid?: string,
    dashboardFilters?: DashboardFilters,
    invalidateCache?: boolean,
) => {
    const { embedToken } = useEmbed();

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
        return resultsData?.metricQuery
            ? itemsInMetricQuery(resultsData.metricQuery)
            : undefined;
    }, [resultsData?.metricQuery]);

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
            return item && (isDimension(item) || isCustomDimension(item));
        });
    }, [columnOrder, itemsMap]);

    const numUnpivotedDimensions =
        dimensions.length - (pivotDimensions?.length || 0);

    const canUseSubtotals = useMemo(() => {
        return !metricsAsRows && numUnpivotedDimensions > 1;
    }, [metricsAsRows, numUnpivotedDimensions]);

    // Once dimensions are loaded, if there are not enough dimensions to use subtotals then
    // turn off "Show subtotals" so that "Show metrics as rows" can be enabled.
    useEffect(() => {
        if (dimensions.length > 0 && numUnpivotedDimensions < 2)
            setShowSubtotals(false);
    }, [dimensions.length, numUnpivotedDimensions]);

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
                  embedToken,
              }
            : {
                  metricQuery: resultsData?.metricQuery,
                  explore: resultsData?.metricQuery?.exploreName,
                  fieldIds: selectedItemIds,
                  itemsMap,
                  showColumnCalculation:
                      tableChartConfig?.showColumnCalculation,
                  // embed token is not necessary here because embeds don't use metricQuery for table calculations
                  embedToken: undefined,
              },
    );

    const { data: groupedSubtotals } = useCalculateSubtotals({
        metricQuery: resultsData?.metricQuery,
        explore: resultsData?.metricQuery?.exploreName,
        showSubtotals,
        columnOrder,
        pivotDimensions,
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
            columnOrder,
            totals: totalCalculations,
            groupedSubtotals,
        });
    }, [
        columnOrder,
        selectedItemIds,
        pivotDimensions,
        itemsMap,
        isColumnVisible,
        showTableNames,
        isColumnFrozen,
        getFieldLabelOverride,
        totalCalculations,
        groupedSubtotals,
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

    useEffect(() => {
        if (
            !pivotDimensions ||
            pivotDimensions.length === 0 ||
            !resultsData?.metricQuery ||
            resultsData.rows.length === 0
        ) {
            setPivotTableData((prevState) => {
                // Only update if values are different
                if (
                    prevState.loading !== false ||
                    prevState.data !== undefined ||
                    prevState.error !== undefined
                ) {
                    return {
                        loading: false,
                        data: undefined,
                        error: undefined,
                    };
                }
                // Return previous state if no changes needed
                return prevState;
            });

            return;
        }

        setPivotTableData((prevState) => ({
            ...prevState,
            loading: true,
            error: undefined,
        }));

        const hiddenMetricFieldIds = selectedItemIds?.filter((fieldId) => {
            const field = getField(fieldId);

            return (
                !isColumnVisible(fieldId) &&
                field &&
                ((isField(field) && isMetric(field)) ||
                    isTableCalculation(field))
            );
        });

        worker
            .pivotQueryResults({
                pivotConfig: {
                    pivotDimensions,
                    metricsAsRows,
                    columnOrder,
                    hiddenMetricFieldIds,
                    columnTotals: tableChartConfig?.showColumnCalculation,
                    rowTotals: tableChartConfig?.showRowCalculation,
                },
                metricQuery: resultsData.metricQuery,
                rows: resultsData.rows,
                groupedSubtotals,
                options: {
                    maxColumns: pivotTableMaxColumnLimit,
                },
                getField,
                getFieldLabel,
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
        getFieldLabel,
        tableChartConfig?.showColumnCalculation,
        tableChartConfig?.showRowCalculation,
        worker,
        pivotTableMaxColumnLimit,
        groupedSubtotals,
    ]);

    // Remove columnProperties from map if the column has been removed from results
    useEffect(() => {
        if (Object.keys(columnProperties).length > 0 && selectedItemIds) {
            const newColumnProperties = Object.keys(columnProperties).reduce<
                Record<string, ColumnProperties>
            >(
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

    const minMaxMap = useMemo(() => {
        if (
            !itemsMap ||
            !resultsData ||
            resultsData.rows.length === 0 ||
            !conditionalFormattings ||
            conditionalFormattings.length === 0
        ) {
            return undefined;
        }

        return Object.entries(itemsMap)
            .filter(
                ([_, field]) => isNumericItem(field) && isFilterableItem(field),
            )
            .filter(([fieldId]) => isColumnVisible(fieldId))
            .filter(([fieldId]) => fieldId in resultsData.rows[0])
            .reduce<ConditionalFormattingMinMaxMap>((acc, [fieldId, field]) => {
                const columnValues = resultsData.rows
                    .map((row) => row[fieldId].value.raw)
                    .filter(
                        (value) =>
                            value !== undefined &&
                            value !== null &&
                            value !== '',
                    )
                    .map((value) => Number(value))
                    .map((value) => convertFormattedValue(value, field));

                return {
                    ...acc,
                    [fieldId]: {
                        min: Math.min(...columnValues),
                        max: Math.max(...columnValues),
                    },
                };
            }, {});
    }, [conditionalFormattings, isColumnVisible, itemsMap, resultsData]);

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

    return useMemo(
        () => ({
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
            metricsAsRows,
            setMetricsAsRows,
            isPivotTableEnabled,
            canUseSubtotals,
            groupedSubtotals,
        }),
        [
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
            metricsAsRows,
            setMetricsAsRows,
            isPivotTableEnabled,
            canUseSubtotals,
            groupedSubtotals,
        ],
    );
};

export default useTableConfig;
