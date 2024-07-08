import { SqlRunnerResultsTransformer, type ResultRow } from '@lightdash/common';
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, type FC } from 'react';
import { SMALL_TEXT_LENGTH } from '../../../../components/common/LightTable';
import BodyCell from '../../../../components/common/Table/ScrollableTable/BodyCell';
import { VirtualizedArea } from '../../../../components/common/Table/ScrollableTable/TableBody';
import {
    ROW_HEIGHT_PX,
    Table as TableStyled,
    TableContainer,
    TableScrollableWrapper,
    TABLE_HEADER_BG,
    Tr,
} from '../../../../components/common/Table/Table.styles';
import { getRawValueCell } from '../../../../hooks/useColumns';
import { type useSqlQueryRun } from '../../hooks/useSqlQueryRun';

type Props = {
    data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>;
};

export const Table: FC<Props> = ({ data }) => {
    const results = new SqlRunnerResultsTransformer({ data });

    const rows = results.getRows();
    const columns = results.getColumns().map((s) => ({
        id: s,
        accessorKey: s,
        header: s.toLocaleUpperCase(),
        cell: getRawValueCell,
    }));

    const table = useReactTable({
        data: rows,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const { rows: rowModelRows } = table.getRowModel();

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => tableContainerRef.current,
        count: rows.length,
        estimateSize: () => ROW_HEIGHT_PX,
        overscan: 25,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();
    const paddingTop =
        virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? rowVirtualizer.getTotalSize() -
              (virtualRows?.[virtualRows.length - 1]?.end || 0)
            : 0;
    const cellsCount = rowModelRows[0]?.getVisibleCells().length || 0;

    return (
        <TableContainer>
            <TableScrollableWrapper ref={tableContainerRef}>
                <TableStyled>
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) =>
                            headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    style={{
                                        backgroundColor: TABLE_HEADER_BG,
                                    }}
                                >
                                    {/* TODO: do I need to check if it's a
                                        placeholder? */}
                                    {flexRender(
                                        header.column.columnDef.header,
                                        header.getContext(),
                                    )}
                                </th>
                            )),
                        )}
                    </thead>
                    <tbody>
                        {paddingTop > 0 && (
                            <VirtualizedArea
                                cellCount={cellsCount}
                                padding={paddingTop}
                            />
                        )}
                        {virtualRows.map(({ index }) => {
                            return (
                                <Tr key={index} $index={index}>
                                    {rowModelRows[index]
                                        .getVisibleCells()
                                        .map((cell) => {
                                            const cellValue =
                                                cell.getValue() as
                                                    | ResultRow[0]
                                                    | undefined;

                                            return (
                                                <BodyCell
                                                    key={cell.id}
                                                    index={index}
                                                    cell={cell}
                                                    isNumericItem={false}
                                                    hasData={!!cellValue}
                                                    isLargeText={
                                                        (
                                                            cellValue?.value
                                                                ?.formatted ||
                                                            ''
                                                        ).length >
                                                        SMALL_TEXT_LENGTH
                                                    }
                                                >
                                                    {cell.getIsPlaceholder()
                                                        ? null
                                                        : flexRender(
                                                              cell.column
                                                                  .columnDef
                                                                  .cell,
                                                              cell.getContext(),
                                                          )}
                                                </BodyCell>
                                            );
                                        })}
                                </Tr>
                            );
                        })}
                        {paddingBottom > 0 && (
                            <VirtualizedArea
                                cellCount={cellsCount}
                                padding={paddingBottom}
                            />
                        )}
                    </tbody>
                </TableStyled>
            </TableScrollableWrapper>
        </TableContainer>
    );
};
