import { type ResultRow } from '@lightdash/common';
import {
    createRow,
    flattenBy,
    memo,
    type Row,
    type RowData,
    type RowModel,
    type Table,
} from '@tanstack/react-table';

// Customizes row grouping based on a clone of
// @tanstack/table-core/src/utils/getGroupedRowModel.ts
// Per TanStack's recommendation:
// https://tanstack.com/table/v8/docs/guide/row-models#customizefork-row-models

function groupBy<TData extends RowData>(rows: Row<TData>[], columnId: string) {
    const groupMap = new Map<unknown, Row<TData>[]>();

    return rows.reduce<typeof groupMap>((map, row) => {
        // This line changed from original since getGroupingValue does not exist here as it should.
        // const resKey = `${row.getGroupingValue(columnId)}`
        const resKey = (row.original as ResultRow)[columnId].value.raw;

        const previous = map.get(resKey);
        if (!previous) {
            map.set(resKey, [row]);
        } else {
            previous.push(row);
        }
        return map;
    }, groupMap);
}

export function getGroupedRowModelLightdash<TData extends RowData>(): (
    table: Table<TData>,
) => () => RowModel<TData> {
    return (table) =>
        memo(
            () => [table.getState().grouping, table.getPreGroupedRowModel()],
            (grouping, rowModel) => {
                if (!rowModel.rows.length || !grouping.length) {
                    return rowModel;
                }

                // Filter the grouping list down to columns that exist
                const existingGrouping = grouping.filter((columnId) =>
                    table.getColumn(columnId),
                );

                const groupedFlatRows: Row<TData>[] = [];
                const groupedRowsById: Record<string, Row<TData>> = {};

                // Recursively group the data
                const groupUpRecursively = (
                    rows: Row<TData>[],
                    depth = 0,
                    parentId?: string,
                ) => {
                    // Grouping depth has been been met
                    // Stop grouping and simply rewrite thd depth and row relationships
                    if (depth >= existingGrouping.length) {
                        return rows.map((row) => {
                            row.depth = depth;

                            groupedFlatRows.push(row);
                            groupedRowsById[row.id] = row;

                            if (row.subRows) {
                                row.subRows = groupUpRecursively(
                                    row.subRows,
                                    depth + 1,
                                    row.id,
                                );
                            }

                            return row;
                        });
                    }

                    const columnId: string = existingGrouping[depth]!;

                    // Group the rows together for this level
                    const rowGroupsMap = groupBy(rows, columnId);

                    // Peform aggregations for each group
                    const aggregatedGroupedRows = Array.from(
                        rowGroupsMap.entries(),
                    ).map(([groupingValue, groupedRows], index) => {
                        let id = `${columnId}:${groupingValue}`;
                        id = parentId ? `${parentId}>${id}` : id;

                        // First, Recurse to group sub rows before aggregation
                        const subRows = groupUpRecursively(
                            groupedRows,
                            depth + 1,
                            id,
                        );

                        // Flatten the leaf rows of the rows in this group
                        const leafRows = depth
                            ? flattenBy(groupedRows, (row) => row.subRows)
                            : groupedRows;

                        const row = createRow(
                            table,
                            id,
                            leafRows[0]!.original,
                            index,
                            depth,

                            // Removed since the version of TanStack currently used does not have these parameters.
                            // undefined,
                            // parentId,
                        );

                        Object.assign(row, {
                            groupingColumnId: columnId,
                            groupingValue,
                            subRows,
                            leafRows,
                            getValue: (columnIdInner: string) => {
                                // Don't aggregate columns that are in the grouping
                                if (existingGrouping.includes(columnIdInner)) {
                                    if (
                                        row._valuesCache.hasOwnProperty(
                                            columnIdInner,
                                        )
                                    ) {
                                        return row._valuesCache[columnIdInner];
                                    }

                                    if (groupedRows[0]) {
                                        row._valuesCache[columnIdInner] =
                                            groupedRows[0].getValue(
                                                columnIdInner,
                                            ) ?? undefined;
                                    }

                                    return row._valuesCache[columnIdInner];
                                }

                                if (
                                    row._groupingValuesCache.hasOwnProperty(
                                        columnIdInner,
                                    )
                                ) {
                                    return row._groupingValuesCache[
                                        columnIdInner
                                    ];
                                }

                                // Aggregate the values
                                const column = table.getColumn(columnIdInner);
                                const aggregateFn = column?.getAggregationFn();

                                if (aggregateFn) {
                                    row._groupingValuesCache[columnIdInner] =
                                        aggregateFn(
                                            columnIdInner,
                                            leafRows,
                                            groupedRows,
                                        );

                                    return row._groupingValuesCache[
                                        columnIdInner
                                    ];
                                }
                            },
                        });

                        subRows.forEach((subRow) => {
                            groupedFlatRows.push(subRow);
                            groupedRowsById[subRow.id] = subRow;
                        });

                        return row;
                    });

                    return aggregatedGroupedRows;
                };

                const groupedRows = groupUpRecursively(rowModel.rows, 0);

                groupedRows.forEach((subRow) => {
                    groupedFlatRows.push(subRow);
                    groupedRowsById[subRow.id] = subRow;
                });

                return {
                    rows: groupedRows,
                    flatRows: groupedFlatRows,
                    rowsById: groupedRowsById,
                };
            },
            {
                key:
                    process.env.NODE_ENV === 'development' &&
                    'getGroupedRowModel',
                debug: () => table.options.debugAll ?? table.options.debugTable,
                onChange: () => {
                    table._queue(() => {
                        table._autoResetExpanded();
                        table._autoResetPageIndex();
                    });
                },
            },
        );
}
