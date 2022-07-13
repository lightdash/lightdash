import {
    ApiQueryResults,
    ColumnProperties,
    Explore,
    Field,
    getItemId,
    getItemLabel,
    getItemMap,
    isField,
    TableCalculation,
    TableChart,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TableColumn } from '../components/common/Table/types';
import useColumnTotals from './useColumnTotals';

const useTableConfig = (
    tableChartConfig: TableChart | undefined,
    resultsData: ApiQueryResults | undefined,
    explore: Explore | undefined,
    columnOrder: string[],
) => {
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

    const totals = useColumnTotals({ resultsData, itemsMap });

    const columns = useMemo(() => {
        return Object.values(itemsMap).reduce<TableColumn[]>((acc, item) => {
            const itemId = getItemId(item);
            if (!isColumnVisible(itemId)) {
                return acc;
            }
            const column: TableColumn = {
                id: itemId,
                header: getHeader(itemId) || getDefaultColumnLabel(itemId),
                accessorKey: itemId,
                cell: (info) => info.getValue()?.value.formatted || '-',
                footer: () => (totals[itemId] ? totals[itemId] : null),
                meta: {
                    item,
                },
            };
            return [...acc, column];
        }, []);
    }, [getDefaultColumnLabel, getHeader, isColumnVisible, itemsMap, totals]);

    // Remove columProperties from map if the column has been removed from results
    useEffect(() => {
        const columnsRemoved = Object.keys(columnProperties).filter(
            (field) => !columnOrder.includes(field),
        );
        columnsRemoved.forEach((field) => delete columnProperties[field]);

        setColumnProperties(columnProperties);
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
            showTableNames,
            columns: columnProperties,
        }),
        [showTableNames, columnProperties],
    );

    return {
        columnOrder,
        validTableConfig,
        showTableNames,
        setShowTableName,
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
