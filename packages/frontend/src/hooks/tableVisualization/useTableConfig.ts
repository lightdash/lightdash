import {
    ApiQueryResults,
    ColumnProperties,
    ConditionalFormattingConfig,
    Explore,
    getItemLabel,
    getItemMap,
    isDimension,
    isField,
    isMetric,
    itemsInMetricQuery,
    PivotData,
    ResultRow,
    TableChart,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableColumn, TableHeader } from '../../components/common/Table/types';
import { pivotQueryResults } from '../pivotTable/pivotQueryResults';
import getDataAndColumns from './getDataAndColumns';
import getPivotDataAndColumns from './getPivotDataAndColumns';

const useTableConfig = (
    tableChartConfig: TableChart | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
    columnOrder: string[],
    pivotDimensions: string[] | undefined,
) => {
    const [showColumnCalculation, setShowColumnCalculation] = useState<boolean>(
        !!tableChartConfig?.showColumnCalculation,
    );

    const [conditionalFormattings, setConditionalFormattings] = useState<
        ConditionalFormattingConfig[]
    >(tableChartConfig?.conditionalFormattings ?? []);

    const [showTableNames, setShowTableName] = useState<boolean>(
        tableChartConfig?.showTableNames === undefined
            ? true
            : tableChartConfig.showTableNames,
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
            explore !== undefined
        ) {
            setShowTableName(explore.joinedTables.length > 0);
        }
    }, [explore, tableChartConfig?.showTableNames]);

    const [columnProperties, setColumnProperties] = useState<
        Record<string, ColumnProperties>
    >(tableChartConfig?.columns === undefined ? {} : tableChartConfig?.columns);

    const selectedItemIds = useMemo(() => {
        return resultsData
            ? itemsInMetricQuery(resultsData.metricQuery)
            : undefined;
    }, [resultsData]);
    const itemsMap = useMemo(() => {
        if (!explore) return {};

        return getItemMap(
            explore,
            resultsData?.metricQuery.additionalMetrics,
            resultsData?.metricQuery.tableCalculations,
        );
    }, [explore, resultsData]);

    const getFieldLabelDefault = useCallback(
        (fieldId: string | null | undefined) => {
            if (!fieldId || !(fieldId in itemsMap)) return undefined;

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
        (fieldId: string) => itemsMap[fieldId],
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

    const canUseMetricsAsRows = useMemo(() => {
        if (
            resultsData?.metricQuery &&
            resultsData.metricQuery.metrics.length > 0 &&
            resultsData.rows.length &&
            pivotDimensions &&
            pivotDimensions.length > 0
        ) {
            return true;
        }
        return false;
    }, [resultsData, pivotDimensions]);

    const pivotTableData = useMemo<{
        data: PivotData | undefined;
        error: undefined | string;
    }>(() => {
        // Note: user can have metricsAsRows enabled but if the configuration isn't allowed, it'll be ignored
        // In future we should change this to an error
        if (
            canUseMetricsAsRows &&
            metricsAsRows &&
            resultsData?.metricQuery &&
            pivotDimensions
        ) {
            // Pivot V2. This will always trigger when the above conditions are met.
            // The old pivot below will always trigger. So currently we pivot twice when the above conditions are met.

            const hiddenMetricFieldIds = selectedItemIds?.filter((fieldId) => {
                const field = getField(fieldId);

                return (
                    !isColumnVisible(fieldId) &&
                    isField(field) &&
                    isMetric(field)
                );
            });

            try {
                const data = pivotQueryResults({
                    pivotConfig: {
                        pivotDimensions,
                        metricsAsRows,
                        columnOrder,
                        hiddenMetricFieldIds,
                    },
                    metricQuery: resultsData.metricQuery,
                    rows: resultsData.rows,
                });

                return { data: data, error: undefined };
            } catch (e) {
                return { data: undefined, error: e.message };
            }
        } else {
            return { data: undefined, error: undefined };
        }
    }, [
        resultsData,
        pivotDimensions,
        columnOrder,
        canUseMetricsAsRows,
        metricsAsRows,
        selectedItemIds,
        isColumnVisible,
        getField,
    ]);

    const { rows, columns, error } = useMemo<{
        rows: ResultRow[];
        columns: Array<TableColumn | TableHeader>;
        error?: string;
    }>(() => {
        if (!resultsData || !selectedItemIds) {
            return {
                rows: [],
                columns: [],
            };
        }
        if (pivotDimensions && pivotDimensions.length > 0) {
            return getPivotDataAndColumns({
                columnOrder,
                itemsMap,
                resultsData,
                pivotDimensions,
                isColumnVisible,
                getFieldLabel,
            });
        } else {
            return getDataAndColumns({
                itemsMap,
                selectedItemIds,
                resultsData,
                isColumnVisible,
                showTableNames,
                getFieldLabelOverride,
                isColumnFrozen,
            });
        }
    }, [
        selectedItemIds,
        columnOrder,
        itemsMap,
        resultsData,
        pivotDimensions,
        isColumnVisible,
        showTableNames,
        isColumnFrozen,
        getFieldLabel,
        getFieldLabelOverride,
    ]);

    // Remove columProperties from map if the column has been removed from results
    useEffect(() => {
        if (Object.keys(columnProperties).length > 0 && selectedItemIds) {
            const columnsRemoved = Object.keys(columnProperties).filter(
                (field) => !selectedItemIds.includes(field),
            );
            columnsRemoved.forEach((field) => delete columnProperties[field]);

            setColumnProperties(columnProperties);
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

    const validTableConfig: TableChart = useMemo(
        () => ({
            showColumnCalculation,
            showTableNames,
            columns: columnProperties,
            hideRowNumbers,
            conditionalFormattings,
            metricsAsRows,
        }),
        [
            showColumnCalculation,
            hideRowNumbers,
            showTableNames,
            columnProperties,
            conditionalFormattings,
            metricsAsRows,
        ],
    );

    return {
        selectedItemIds,
        columnOrder,
        validTableConfig,
        showColumnCalculation,
        setShowColumnCalculation,
        showTableNames,
        setShowTableName,
        hideRowNumbers,
        setHideRowNumbers,
        metricsAsRows,
        setMetricsAsRows,
        rows,
        error,
        columns,
        columnProperties,
        setColumnProperties,
        updateColumnProperty,
        getFieldLabelOverride,
        getFieldLabelDefault,
        getFieldLabel,
        getField,
        isColumnVisible,
        isColumnFrozen,
        conditionalFormattings,
        onSetConditionalFormattings: handleSetConditionalFormattings,
        pivotTableData,
        canUseMetricsAsRows,
    };
};

export default useTableConfig;
