import {
    ApiQueryResults,
    ColumnProperties,
    Explore,
    getItemLabel,
    getItemMap,
    isField,
    itemsInMetricQuery,
    ResultRow,
    TableChart,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableColumn, TableHeader } from '../../components/common/Table/types';
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

    const [showTableNames, setShowTableName] = useState<boolean>(
        tableChartConfig?.showTableNames === undefined
            ? true
            : tableChartConfig.showTableNames,
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

    const selectedItemIds = useMemo(
        () => itemsInMetricQuery(resultsData?.metricQuery),
        [resultsData],
    );
    const itemsMap = useMemo(() => {
        if (explore) {
            return getItemMap(
                explore,
                resultsData?.metricQuery.additionalMetrics,
                resultsData?.metricQuery.tableCalculations,
            );
        }
        return {};
    }, [explore, resultsData]);

    const getDefaultColumnLabel = useCallback(
        (fieldId: string) => {
            const item = itemsMap[fieldId] as
                | typeof itemsMap[number]
                | undefined;
            if (item === undefined) {
                return '';
            }
            if (isField(item) && !showTableNames) {
                return item.label;
            } else {
                return getItemLabel(item);
            }
        },
        [itemsMap, showTableNames],
    );

    // This is controlled by the state in this component.
    // User configures the names and visibilty of these in the config panel
    const isColumnVisible = useCallback(
        (fieldId: string) => columnProperties[fieldId]?.visible ?? true,
        [columnProperties],
    );

    const getHeader = useCallback(
        (fieldId: string) => {
            return columnProperties[fieldId]?.name;
        },
        [columnProperties],
    );

    const { rows, columns, error } = useMemo<{
        rows: ResultRow[];
        columns: Array<TableColumn | TableHeader>;
        error?: string;
    }>(() => {
        const pivotDimension = pivotDimensions?.[0];
        if (!resultsData) {
            return {
                rows: [],
                columns: [],
            };
        }
        if (pivotDimension) {
            return getPivotDataAndColumns({
                columnOrder,
                itemsMap,
                resultsData,
                pivotDimension,
                isColumnVisible,
                getHeader,
                getDefaultColumnLabel,
            });
        } else {
            return getDataAndColumns({
                itemsMap,
                selectedItemIds,
                resultsData,
                isColumnVisible,
                showTableNames,
                getHeader,
            });
        }
    }, [
        selectedItemIds,
        columnOrder,
        itemsMap,
        resultsData,
        pivotDimensions,
        isColumnVisible,
        getHeader,
        getDefaultColumnLabel,
        showTableNames,
    ]);

    // Remove columProperties from map if the column has been removed from results
    useEffect(() => {
        if (Object.keys(columnProperties).length > 0 && resultsData) {
            const columnsRemoved = Object.keys(columnProperties).filter(
                (field) => !selectedItemIds.includes(field),
            );
            columnsRemoved.forEach((field) => delete columnProperties[field]);

            setColumnProperties(columnProperties);
        }
    }, [selectedItemIds, resultsData, columnProperties]);

    const updateColumnProperty = (
        field: string,
        properties: Partial<ColumnProperties>,
    ) => {
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
    };

    const validTableConfig: TableChart = useMemo(
        () => ({
            showColumnCalculation,
            showTableNames,
            columns: columnProperties,
        }),
        [showColumnCalculation, showTableNames, columnProperties],
    );

    return {
        selectedItemIds,
        columnOrder,
        validTableConfig,
        showColumnCalculation,
        setShowColumnCalculation,
        showTableNames,
        setShowTableName,
        rows,
        error,
        columns,
        columnProperties,
        setColumnProperties,
        updateColumnProperty,
        getHeader,
        getDefaultColumnLabel,
        isColumnVisible,
    };
};

export default useTableConfig;
