import { type ResultRow, type ResultValue } from '@lightdash/common';
import {
    buildTableColumns,
    getUniqueColumnOrder,
    findMatchingSubtotal as findMatchingSubtotalHeadless,
    getRowSubtotalValue,
    getSubtotalGroupKey,
    getSubtotalValueFromGroup,
    getTableSubtotalCell,
    type TableColumnsInput,
    type TableModelColumn,
} from '@lightdash/visualization/editor';
import { Skeleton, Text } from '@mantine/core';
import { captureException } from '@sentry/react';
import type { CellContext } from '@tanstack/react-table';
import {
    TableHeaderBoldLabel,
    TableHeaderLabelContainer,
    TableHeaderRegularLabel,
} from '../../components/common/Table/Table.styles';
import TotalCalculationErrorCell from '../../components/common/Table/TotalCalculationErrorCell';
import TotalFromSourceCell from '../../components/common/Table/TotalFromSourceCell';
import TotalNotComputableCell from '../../components/common/Table/TotalNotComputableCell';
import {
    columnHelper,
    type TableColumn,
    type TableHeader,
} from '../../components/common/Table/types';
import { getFormattedValueCell } from '../useColumns';

export { getRowSubtotalValue, getSubtotalValueFromGroup };

type Args = TableColumnsInput;

export function getGroupingValuesAndSubtotalKey(
    info: Pick<CellContext<ResultRow, unknown>, 'row' | 'table'>,
) {
    const groupingDimensions = info.table
        .getState()
        .grouping.slice(0, info.row.depth + 1);

    // Calculate the subtotal key for the row, this is used to find the subtotal in the groupedSubtotals object
    const subtotalGroupKey = getSubtotalGroupKey(groupingDimensions);

    if (subtotalGroupKey === undefined) {
        return;
    }

    // Get the grouping values for each of the dimensions in the row
    const groupingValues = Object.fromEntries(
        groupingDimensions.map((d) => [
            d,
            info.row.getGroupingValue(d) as ResultRow[number] | undefined,
        ]),
    );

    return { groupingValues, subtotalGroupKey };
}

// Pass `{}` for pivotedHeaderValues in the non-pivoted path.
export function findMatchingSubtotal(
    records: Record<string, number>[] | undefined,
    groupingValues: Record<string, { value: ResultValue } | undefined>,
    pivotedHeaderValues: Record<string, ResultValue>,
): Record<string, number> | undefined {
    return findMatchingSubtotalHeadless(
        records,
        groupingValues,
        pivotedHeaderValues,
        captureException,
    );
}

const getImageSize = (imageWidth: number | undefined) => {
    if (imageWidth !== undefined) {
        return {
            style: {
                width: imageWidth,
                minWidth: imageWidth,
                maxWidth: imageWidth,
            },
        };
    }
    return {};
};

const getColumnWidthMeta = (width: number | undefined) => {
    if (width === undefined) return {};
    return {
        width,
        style: {
            width,
            minWidth: width,
            maxWidth: width,
        },
    };
};

const renderHeader = (header: TableModelColumn['header']) => {
    switch (header.kind) {
        case 'override':
            return <TableHeaderBoldLabel>{header.label}</TableHeaderBoldLabel>;
        case 'field':
            return (
                <>
                    {header.showTableName && (
                        <TableHeaderRegularLabel>
                            {header.tableLabel}{' '}
                        </TableHeaderRegularLabel>
                    )}

                    <TableHeaderBoldLabel>{header.label}</TableHeaderBoldLabel>
                </>
            );
        case 'customDimension':
        case 'other':
            return <TableHeaderBoldLabel>{header.label}</TableHeaderBoldLabel>;
    }
};

const renderTotal = (total: TableModelColumn['total']) => {
    if (total === null) return null;
    switch (total.kind) {
        case 'value':
            return total.value;
        case 'valueFromSource':
            return (
                <TotalFromSourceCell
                    value={total.value}
                    sourceLabel={total.sourceLabel}
                />
            );
        case 'notComputable':
            return <TotalNotComputableCell reason={total.reason} />;
        case 'error':
            return <TotalCalculationErrorCell error={total.error} />;
        case 'loading':
            return <Skeleton height={16} width="min(60%, 50px)" ml="auto" />;
    }
};

const getDataAndColumns = (args: Args): Array<TableHeader | TableColumn> => {
    const { groupedSubtotals, subtotalsLoading, subtotalsError, parameters } =
        args;

    const { columnOrder } = args;
    const uniqueColumnOrder = getUniqueColumnOrder(columnOrder);
    if (uniqueColumnOrder.length !== columnOrder.length) {
        console.warn(
            'Duplicate columns in columnOrder',
            columnOrder,
            uniqueColumnOrder,
        );
        captureException(new Error('Duplicate columns in columnOrder'), {
            level: 'error',
            tags: { errorType: 'duplicateColumns' },
            extra: { columnOrder, uniqueColumnOrder },
        });
    }

    const columns = buildTableColumns(args);

    return columns.map((modelColumn) => {
        const { id: itemId, item } = modelColumn;

        const column: TableHeader | TableColumn = columnHelper.accessor(
            (row: ResultRow) => row[itemId],
            {
                id: itemId,
                header: () => (
                    <TableHeaderLabelContainer>
                        {renderHeader(modelColumn.header)}
                    </TableHeaderLabelContainer>
                ),
                cell: (info) => getFormattedValueCell(info, parameters),

                footer: () => renderTotal(modelColumn.total),
                meta: {
                    item,
                    labelOverride: modelColumn.labelOverride,
                    isVisible: modelColumn.isVisible,
                    frozen: modelColumn.frozen,
                    // For image columns with explicit width: set fixed width constraints
                    ...getImageSize(modelColumn.imageWidth),
                    ...getColumnWidthMeta(modelColumn.width),
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
                        const subtotal = findMatchingSubtotal(
                            groupedSubtotals?.[subtotalGroupKey],
                            groupingValues,
                            {},
                        );

                        const subtotalValue = getSubtotalValueFromGroup(
                            subtotal,
                            info.column.id,
                        );

                        const subtotalCell = getTableSubtotalCell({
                            item,
                            subtotalValue,
                            subtotalsLoading,
                            subtotalsError,
                            parameters,
                        });

                        if (subtotalCell === null) {
                            return null;
                        }

                        switch (subtotalCell.kind) {
                            case 'error':
                                return (
                                    <TotalCalculationErrorCell
                                        error={subtotalCell.error}
                                    />
                                );
                            case 'loading':
                                return (
                                    <Skeleton
                                        height={16}
                                        width="min(60%, 50px)"
                                        ml="auto"
                                    />
                                );
                            case 'value':
                                return (
                                    <Text span inherit fw={600}>
                                        {subtotalCell.value}
                                    </Text>
                                );
                        }
                    }
                },
            },
        );
        return column;
    });
};

export default getDataAndColumns;
