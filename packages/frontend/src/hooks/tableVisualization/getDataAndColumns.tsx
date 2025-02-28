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
                        // TODO: Deduplicate this with the pivotTable code
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
                            const subtotalsGroup = groupedSubtotals?.[
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

                            const subtotalColumnIds = Object.keys(
                                subtotalsGroup ?? {},
                            );

                            // If the subtotal column is not in the subtotalsGroup, return null
                            // This is needed to prevent showing '-' when processing a value for the last grouped dimension column which is not taken into account for subtotals
                            // This column only exists when we're expanding the last grouped dimension
                            if (!subtotalColumnIds.includes(info.column.id)) {
                                return null;
                            }

                            const subtotalValue =
                                subtotalsGroup?.[info.column.id];

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
