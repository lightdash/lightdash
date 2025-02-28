import {
    formatItemValue,
    friendlyName,
    isField,
    type ApiQueryResults,
    type ItemsMap,
    type ResultRow,
} from '@lightdash/common';
import { getSubtotalKey } from '@lightdash/common/src/utils/subtotals';
import { Text } from '@mantine/core';
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

// Adapted from https://stackoverflow.com/a/45337588
const decimalLength = (numStr: number) => {
    const pieces = numStr.toString().split('.');
    if (!pieces[1]) return 0;
    return pieces[1].length;
};
export const getDecimalPrecision = (addend1: number, addend2: number) =>
    Math.pow(10, Math.max(decimalLength(addend1), decimalLength(addend2)));

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
                            ) : (
                                <TableHeaderBoldLabel>
                                    {item === undefined
                                        ? 'Undefined'
                                        : 'displayName' in item
                                        ? item.displayName
                                        : friendlyName(item.name)}
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
                            const groupedDimensions = info.row.id
                                .split('>')
                                .map((rowIdParts) => rowIdParts.split(':')[0])
                                .filter((d) => d !== undefined);

                            if (!groupedDimensions.length) {
                                return null;
                            }

                            // Get the grouping values for each of the dimensions in the row
                            const groupingValues = Object.fromEntries(
                                groupedDimensions.map((d) => [
                                    d,
                                    info.row.getGroupingValue(d) as
                                        | ResultRow[number]
                                        | undefined,
                                ]),
                            );

                            // Calculate the subtotal key for the row, this is used to find the subtotal in the groupedSubtotals object
                            const subtotalGroupKey =
                                getSubtotalKey(groupedDimensions);

                            // Find the subtotal for the row, this is used to find the subtotal in the groupedSubtotals object
                            const foundSubtotal = groupedSubtotals?.[
                                subtotalGroupKey
                            ]?.find((subtotal) => {
                                return Object.keys(groupingValues).every(
                                    (key) => {
                                        return (
                                            groupingValues[key]?.value.raw ===
                                            subtotal[key]
                                        );
                                    },
                                );
                            });

                            const subtotalValue =
                                foundSubtotal?.[info.column.id];

                            if (!subtotalValue) {
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
