import {
    ApiQueryResults,
    ColumnProperties,
    Explore,
    Field,
    getItemLabel,
    getItemMap,
    isField,
    TableCalculation,
    TableChart,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

    const [columnProperties, setColumnProperties] = useState<
        Record<string, ColumnProperties>
    >(tableChartConfig?.columns === undefined ? {} : tableChartConfig?.columns);

    const itemsMap = useMemo(() => {
        if (explore) {
            const allItemsMap = getItemMap(
                explore,
                resultsData?.metricQuery.additionalMetrics,
                resultsData?.metricQuery.tableCalculations,
            );
            return Object.entries(allItemsMap).reduce<
                Record<string, Field | TableCalculation>
            >(
                (acc, [key, value]) =>
                    columnOrder.includes(key)
                        ? {
                              ...acc,
                              [key]: value,
                          }
                        : acc,
                {},
            );
        }
        return {};
    }, [explore, resultsData, columnOrder]);

    const getDefaultColumnLabel = useCallback(
        (fieldId: string) => {
            const item = itemsMap[fieldId];
            if (isField(item) && !showTableNames) {
                return item.label;
            } else {
                return getItemLabel(item);
            }
        },
        [itemsMap, showTableNames],
    );

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

    const { rows, columns, error } = useMemo(() => {
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
                resultsData,
                isColumnVisible,
                getHeader,
                getDefaultColumnLabel,
            });
        }
    }, [
        columnOrder,
        itemsMap,
        resultsData,
        pivotDimensions,
        isColumnVisible,
        getHeader,
        getDefaultColumnLabel,
    ]);

    // Remove columProperties from map if the column has been removed from results
    useEffect(() => {
        if (Object.keys(columnProperties).length > 0) {
            const columnsRemoved = Object.keys(columnProperties).filter(
                (field) => !columnOrder.includes(field),
            );
            columnsRemoved.forEach((field) => delete columnProperties[field]);

            setColumnProperties(columnProperties);
        }
    }, [columnOrder, columnProperties]);

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
