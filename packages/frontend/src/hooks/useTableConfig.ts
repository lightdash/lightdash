import { Colors } from '@blueprintjs/core';
import {
    ApiQueryResults,
    ColumnProperties,
    Explore,
    Field,
    formatItemValue,
    getItemId,
    getItemLabel,
    getItemMap,
    hashFieldReference,
    isDimension,
    isField,
    TableCalculation,
    TableChart,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { columnHelper, TableColumn } from '../components/common/Table/types';
import useColumnTotals from './useColumnTotals';

const sortByRawValue = (a: any, b: any) => {
    const typeOfA = typeof a;
    const typeOfB = typeof b;
    try {
        if (typeOfA === 'string' && typeOfB === 'string') {
            return a.localeCompare(b);
        }
        return a - b;
    } catch (e) {
        return -1;
    }
};

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

    const totals = useColumnTotals({ resultsData, itemsMap });

    const pivotDimension = pivotDimensions?.[0];
    const uniquePivotValues: Record<string, { raw: any; formatted: any }> =
        useMemo(
            () =>
                pivotDimension && itemsMap[pivotDimension] && resultsData
                    ? resultsData.rows.reduce<
                          Record<string, { raw: any; formatted: any }>
                      >((acc, row) => {
                          const value = row[pivotDimension].value;
                          return { ...acc, [`${value.raw}`]: value };
                      }, {})
                    : {},
            [pivotDimension, itemsMap, resultsData],
        );

    const columns = useMemo(() => {
        if (
            pivotDimension &&
            itemsMap[pivotDimension] &&
            Object.keys(uniquePivotValues).length > 0
        ) {
            const dimensionHeaders = Object.values(itemsMap).reduce<
                TableColumn[]
            >((acc, item) => {
                const itemId = getItemId(item);
                if (
                    !isColumnVisible(itemId) ||
                    itemId === pivotDimension ||
                    !isDimension(item)
                ) {
                    return acc;
                }
                const column: TableColumn = columnHelper.accessor(itemId, {
                    id: itemId,
                    header: getHeader(itemId) || getDefaultColumnLabel(itemId),
                    cell: (info) => info.getValue()?.value.formatted || '-',
                    footer: () =>
                        totals[itemId]
                            ? formatItemValue(item, totals[itemId])
                            : null,
                    meta: {
                        item,
                    },
                });
                return [...acc, column];
            }, []);
            const dimensionsHeaderGroup = columnHelper.group({
                id: 'dimensions_header_group',
                header:
                    getHeader(pivotDimension) ||
                    getDefaultColumnLabel(pivotDimension),
                columns: dimensionHeaders,
                meta: {
                    bgColor: Colors.GRAY4,
                },
            });
            const pivotValueHeaderGroups = Object.entries(uniquePivotValues)
                .sort(([_, a], [__, b]) => sortByRawValue(a.raw, b.raw))
                .map(([_, { raw, formatted }]) => {
                    return columnHelper.group({
                        id: `pivot_header_group_${raw}`,
                        header: () => formatted,
                        meta: {
                            bgColor: Colors.GRAY4,
                        },
                        columns: Object.values(itemsMap)
                            .sort(
                                (a, b) =>
                                    columnOrder.findIndex(
                                        (id) => id === getItemId(a),
                                    ) -
                                    columnOrder.findIndex(
                                        (id) => id === getItemId(b),
                                    ),
                            )
                            .reduce<TableColumn[]>((acc, item) => {
                                const itemId = getItemId(item);
                                if (
                                    !isColumnVisible(itemId) ||
                                    isDimension(item)
                                ) {
                                    return acc;
                                }
                                const key = hashFieldReference({
                                    field: itemId,
                                    pivotValues: [
                                        { field: pivotDimension, value: raw },
                                    ],
                                });
                                const column: TableColumn =
                                    columnHelper.accessor((row) => row[key], {
                                        id: key,
                                        header:
                                            getHeader(itemId) ||
                                            getDefaultColumnLabel(itemId),
                                        cell: (info) =>
                                            info.getValue()?.value.formatted ||
                                            '-',
                                        footer: () =>
                                            totals[itemId]
                                                ? formatItemValue(
                                                      item,
                                                      totals[itemId],
                                                  )
                                                : null,
                                        meta: {
                                            item,
                                        },
                                    });
                                return [...acc, column];
                            }, []),
                    });
                });

            return [dimensionsHeaderGroup, ...pivotValueHeaderGroups];
        }

        return Object.values(itemsMap).reduce<TableColumn[]>((acc, item) => {
            const itemId = getItemId(item);
            if (!isColumnVisible(itemId)) {
                return acc;
            }
            const column: TableColumn = {
                id: itemId,
                header: getHeader(itemId) || getDefaultColumnLabel(itemId),
                accessorKey: itemId,
                cell: (info: any) => info.getValue()?.value.formatted || '-',
                footer: () =>
                    totals[itemId]
                        ? formatItemValue(item, totals[itemId])
                        : null,
                meta: {
                    item,
                },
            };
            return [...acc, column];
        }, []);
    }, [
        getDefaultColumnLabel,
        getHeader,
        isColumnVisible,
        itemsMap,
        pivotDimension,
        totals,
        uniquePivotValues,
        columnOrder,
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
