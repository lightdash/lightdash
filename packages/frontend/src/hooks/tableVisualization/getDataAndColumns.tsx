import {
    formatItemValue,
    getSubtotalKey,
    isCustomDimension,
    isField,
    type ApiQueryResults,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { Text } from '@mantine/core';
import type { CellContext } from '@tanstack/react-table';
import {
    TableHeaderBoldLabel,
    TableHeaderLabelContainer,
    TableHeaderRegularLabel,
} from '../../components/common/Table/Table.styles';
import {
    columnHelper,
    type TableColumn,
    type TableHeader,
} from '../../components/common/Table/types';
import { getFormattedValueCell } from '../useColumns';

type Args = {
    itemsMap: ItemsMap;
    selectedItemIds: string[];
    resultsData: ApiQueryResults;
    isColumnVisible: (key: string) => boolean;
    isColumnFrozen: (key: string) => boolean;
    showTableNames: boolean;
    getFieldLabelOverride: (key: string) => string | undefined;
    columnOrder: string[];
    totals?: Record<string, number>;
    groupedSubtotals?: Record<string, Record<string, number>[]>;
};

export function getGroupingValuesAndSubtotalKey(
    info: CellContext<ResultRow, ResultRow[string]>,
) {
    const groupingDimensions = info.table
        .getState()
        .grouping.slice(0, info.row.depth + 1);

    if (!groupingDimensions.length) {
        return;
    }

    // Get the grouping values for each of the dimensions in the row
    const groupingValues = Object.fromEntries(
        groupingDimensions.map((d) => [
            d,
            info.row.getGroupingValue(d) as ResultRow[number] | undefined,
        ]),
    );

    // Calculate the subtotal key for the row, this is used to find the subtotal in the groupedSubtotals object
    const subtotalGroupKey = getSubtotalKey(groupingDimensions);

    return { groupingValues, subtotalGroupKey };
}

export function getSubtotalValueFromGroup(
    subtotal: Record<string, number> | undefined,
    columnId: string,
) {
    const subtotalColumnIds = Object.keys(subtotal ?? {});

    // If the subtotal column is not in the subtotalsGroup, return null
    // This is needed to prevent showing '-' when processing a value for the last grouped dimension column which is not taken into account for subtotals
    // This column only exists when we're expanding the last grouped dimension
    if (!subtotalColumnIds.includes(columnId)) {
        return null;
    }

    return subtotal?.[columnId];
}

const getDataAndColumns = ({
    itemsMap,
    selectedItemIds,
    resultsData,
    isColumnVisible,
    isColumnFrozen,
    showTableNames,
    getFieldLabelOverride,
    columnOrder,
    totals,
    groupedSubtotals,
}: Args): {
    rows: ResultRow[];
    columns: Array<TableHeader | TableColumn>;
    error?: string;
} => {
    const columns = selectedItemIds.reduce<Array<TableHeader | TableColumn>>(
        (acc, itemId) => {
            const item = itemsMap[itemId] as
                | typeof itemsMap[number]
                | undefined;

            if (!columnOrder.includes(itemId)) {
                return acc;
            }
            const headerOverride = getFieldLabelOverride(itemId);

            const column: TableHeader | TableColumn = columnHelper.accessor(
                (row) => row[itemId],
                {
                    id: itemId,
                    header: () => (
                        <TableHeaderLabelContainer>
                            {!!headerOverride ? (
                                <TableHeaderBoldLabel>
                                    {headerOverride}
                                </TableHeaderBoldLabel>
                            ) : isField(item) ? (
                                <>
                                    {showTableNames && (
                                        <TableHeaderRegularLabel>
                                            {item.tableLabel}{' '}
                                        </TableHeaderRegularLabel>
                                    )}

                                    <TableHeaderBoldLabel>
                                        {item.label}
                                    </TableHeaderBoldLabel>
                                </>
                            ) : isCustomDimension(item) ? (
                                <TableHeaderBoldLabel>
                                    {item.name}
                                </TableHeaderBoldLabel>
                            ) : (
                                <TableHeaderBoldLabel>
                                    {item && 'displayName' in item
                                        ? item.displayName
                                        : 'Undefined'}
                                </TableHeaderBoldLabel>
                            )}
                        </TableHeaderLabelContainer>
                    ),
                    cell: getFormattedValueCell,

                    footer: () =>
                        totals?.[itemId]
                            ? formatItemValue(item, totals[itemId])
                            : null,
                    meta: {
                        item,
                        isVisible: isColumnVisible(itemId),
                        frozen: isColumnFrozen(itemId),
                    },
                    // Some features work in the TanStack Table demos but not here, for unknown reasons.
                    // For example, setting grouping value here does not work. The workaround is to use
                    // a custom getGroupedRowModel.
                    // getGroupingValue: (row) => { // Never gets called.
                    //     const value = row[itemId]?.value.raw;
                    //     return value === null || value === undefined ? 'null' : value;
                    // },
                    // aggregationFn: 'sum', // Not working.
                    // aggregationFn: 'max', // At least results in a cell value, although it's incorrect.
                    aggregatedCell: (info) => {
                        if (info.row.getIsGrouped()) {
                            const groupingValuesAndSubtotalKey =
                                getGroupingValuesAndSubtotalKey(info);

                            if (!groupingValuesAndSubtotalKey) {
                                return null;
                            }

                            const { groupingValues, subtotalGroupKey } =
                                groupingValuesAndSubtotalKey;

                            // Find the subtotal for the row, this is used to find the subtotal in the groupedSubtotals object
                            const subtotal = groupedSubtotals?.[
                                subtotalGroupKey
                            ]?.find((sub) => {
                                try {
                                    return Object.keys(groupingValues).every(
                                        (key) => {
                                            return (
                                                groupingValues[key]?.value
                                                    .raw === sub[key]
                                            );
                                        },
                                    );
                                } catch (e) {
                                    console.error(e);
                                    return false;
                                }
                            });

                            const subtotalValue = getSubtotalValueFromGroup(
                                subtotal,
                                info.column.id,
                            );

                            if (subtotalValue === null) {
                                return null;
                            }

                            return (
                                <Text span fw={600}>
                                    {formatItemValue(item, subtotalValue)}
                                </Text>
                            );
                        }
                    },
                },
            );
            return [...acc, column];
        },
        [],
    );
    return {
        rows: resultsData.rows,
        columns,
    };
};

export default getDataAndColumns;
