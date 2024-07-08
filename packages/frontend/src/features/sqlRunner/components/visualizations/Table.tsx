import { SqlRunnerResultsTransformer, type ResultRow } from '@lightdash/common';
import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
    type Table as TableType,
} from '@tanstack/react-table';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
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

type TableChartSqlConfig =
    | {
          columns: Record<
              string,
              {
                  visible: boolean;
                  reference: string;
                  label: string;
                  frozen: boolean;
                  order?: number;
              }
          >;
      }
    | undefined;

class TableDataProcessor {
    private transformer: SqlRunnerResultsTransformer;

    private columns: ColumnDef<ResultRow, any>[];

    private rows: ResultRow[];

    constructor(
        data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>,
        private config: TableChartSqlConfig,
    ) {
        this.transformer = new SqlRunnerResultsTransformer({ data });
        this.columns = this.createColumns();
        this.rows = this.transformer.getRows();
    }

    private createColumns(): ColumnDef<ResultRow, any>[] {
        const columns = this.transformer.getColumns();
        return columns
            .filter((column) =>
                this.config ? this.config.columns[column]?.visible : true,
            )
            .map((column) => ({
                id: column,
                accessorKey: column,
                header: this.config?.columns[column].label || column,
                cell: getRawValueCell,
            }));
    }

    public getColumns(): ColumnDef<ResultRow, any>[] {
        return this.columns;
    }

    public getRows(): ResultRow[] {
        return this.rows;
    }

    public getRowHeight(): number {
        return ROW_HEIGHT_PX;
    }

    public getRowsCount(): number {
        return this.rows.length;
    }

    public getColumnsCount(): number {
        return this.columns.length;
    }

    public getTableData(
        table: TableType<ResultRow>,
        rowVirtualizer: Virtualizer<HTMLDivElement, Element>,
    ) {
        const { rows: rowModelRows } = table.getRowModel();
        const virtualRows = rowVirtualizer.getVirtualItems();

        return {
            headerGroups: table.getHeaderGroups(),
            virtualRows,
            rowModelRows,
        };
    }
}

type Props = {
    data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>;
    config?: TableChartSqlConfig;
};

export const Table: FC<Props> = ({ data }) => {
    const processor = new TableDataProcessor(data, undefined); // TODO: add config once we have it

    const columns = processor.getColumns();
    const rows = processor.getRows();
    const rowsCount = processor.getRowsCount();
    const rowHeight = processor.getRowHeight();
    const columnsCount = processor.getColumnsCount();

    const table = useReactTable({
        data: rows,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    const tableContainerRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => tableContainerRef.current,
        count: rowsCount,
        estimateSize: () => rowHeight,
        overscan: 25,
    });

    const { headerGroups, virtualRows, rowModelRows } = processor.getTableData(
        table,
        rowVirtualizer,
    );

    const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start || 0 : 0;
    const paddingBottom =
        virtualRows.length > 0
            ? rowVirtualizer.getTotalSize() -
              (virtualRows[virtualRows.length - 1]?.end || 0)
            : 0;

    return (
        <TableContainer>
            <TableScrollableWrapper ref={tableContainerRef}>
                <TableStyled>
                    <thead>
                        {headerGroups.map((headerGroup) =>
                            headerGroup.headers.map((header) => (
                                <th
                                    key={header.id}
                                    style={{
                                        backgroundColor: TABLE_HEADER_BG,
                                    }}
                                >
                                    {/* TODO: do we need to check if it's a
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
                                cellCount={columnsCount}
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
                                cellCount={columnsCount}
                                padding={paddingBottom}
                            />
                        )}
                    </tbody>
                </TableStyled>
            </TableScrollableWrapper>
        </TableContainer>
    );
};
