import { Colors } from '@blueprintjs/core';
import {
    ApiQueryResults,
    Field,
    formatItemValue,
    ResultRow,
    TableCalculation,
} from '@lightdash/common';
import {
    columnHelper,
    TableColumn,
    TableHeader,
} from '../../components/common/Table/types';
import { getPivotedData } from '../plottedData/usePlottedData';
import { getResultColumnTotals, isSummable } from '../useColumnTotals';

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

type Args = {
    columnOrder: string[];
    itemsMap: Record<string, Field | TableCalculation>;
    resultsData: ApiQueryResults;
    pivotDimension: string;
    isColumnVisible: (key: string) => boolean;
    getHeader: (key: string) => string | undefined;
    getDefaultColumnLabel: (key: string) => string;
};

const getPivotDataAndColumns = ({
    columnOrder,
    itemsMap,
    resultsData,
    pivotDimension,
    isColumnVisible,
    getHeader,
    getDefaultColumnLabel,
}: Args): {
    rows: ResultRow[];
    columns: Array<TableHeader | TableColumn>;
    error?: string;
} => {
    const { rows, pivotValuesMap, rowKeyMap } = getPivotedData(
        resultsData.rows,
        pivotDimension,
        [
            ...resultsData.metricQuery.metrics,
            ...resultsData.metricQuery.tableCalculations.map((tc) => tc.name),
        ].filter((itemId) => isColumnVisible(itemId)),
        resultsData.metricQuery.dimensions.filter(
            (itemId) => isColumnVisible(itemId) && pivotDimension !== itemId,
        ),
    );

    if (Object.keys(pivotValuesMap).length > 20) {
        return {
            rows: [],
            columns: [],
            error: 'Exceeded max amount of 20 pivot values',
        };
    }

    const totals = getResultColumnTotals(
        rows,
        Object.entries(rowKeyMap).reduce<string[]>((acc, [key, ref]) => {
            const item =
                typeof ref === 'string' ? itemsMap[ref] : itemsMap[ref.field];
            return item && isSummable(item) ? [...acc, key] : acc;
        }, []),
    );

    const dimensionHeaders = Object.values(rowKeyMap).reduce<TableColumn[]>(
        (acc, ref) => {
            if (typeof ref === 'string') {
                const item = itemsMap[ref];
                const column: TableColumn = columnHelper.accessor(ref, {
                    id: ref,
                    header: getHeader(ref) || getDefaultColumnLabel(ref),
                    cell: (info) => info.getValue()?.value.formatted || '-',
                    footer: () =>
                        totals[ref] ? formatItemValue(item, totals[ref]) : null,
                    meta: {
                        item,
                    },
                });
                return [...acc, column];
            }
            return acc;
        },
        [],
    );
    const dimensionsHeaderGroup = columnHelper.group({
        id: 'dimensions_header_group',
        header:
            getHeader(pivotDimension) || getDefaultColumnLabel(pivotDimension),
        columns: dimensionHeaders,
        meta: {
            bgColor: Colors.GRAY4,
            item: itemsMap[pivotDimension],
        },
    });
    const pivotValueHeaderGroups = Object.values(pivotValuesMap)
        .sort((a, b) => sortByRawValue(a.raw, b.raw))
        .map(({ raw, formatted }) => {
            return columnHelper.group({
                id: `pivot_header_group_${raw}`,
                header: () => formatted,
                meta: {
                    bgColor: Colors.GRAY4,
                },
                columns: Object.entries(rowKeyMap)
                    .filter(([_, ref]) => {
                        return (
                            typeof ref !== 'string' &&
                            ref.pivotValues &&
                            ref.pivotValues[0]?.value === raw
                        );
                    })
                    .sort(([_, aRef], [__, bRef]) => {
                        const a = typeof aRef === 'string' ? aRef : aRef.field;
                        const b = typeof bRef === 'string' ? bRef : bRef.field;
                        return (
                            columnOrder.findIndex((id) => id === a) -
                            columnOrder.findIndex((id) => id === b)
                        );
                    })
                    .reduce<TableColumn[]>((acc, [key, ref]) => {
                        if (typeof ref === 'string') {
                            return acc;
                        }
                        const item = itemsMap[ref.field];
                        const column: TableColumn = columnHelper.accessor(
                            (row) => row[key],
                            {
                                id: key,
                                header:
                                    getHeader(ref.field) ||
                                    getDefaultColumnLabel(ref.field),
                                cell: (info) =>
                                    info.getValue()?.value.formatted || '-',
                                footer: () =>
                                    totals[key]
                                        ? formatItemValue(item, totals[key])
                                        : null,
                                meta: {
                                    item,
                                },
                            },
                        );
                        return [...acc, column];
                    }, []),
            });
        });

    const columns = [dimensionsHeaderGroup, ...pivotValueHeaderGroups];
    return {
        rows,
        columns,
    };
};

export default getPivotDataAndColumns;
