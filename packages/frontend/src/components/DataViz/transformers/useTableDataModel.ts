import {
    TableDataModel,
    type ResultRow,
    type VizTableConfig,
} from '@lightdash/common';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef } from 'react';
import { getRawValueCell } from '../../../hooks/useColumns';
import { ROW_HEIGHT_PX } from '../../common/Table/Table.styles';

export const useTableDataModel = (
    data: ResultRow[],
    config: VizTableConfig | undefined,
) => {
    const transformer = useMemo(
        () => new TableDataModel<ResultRow>(data, config),
        [data, config],
    );

    const columns = useMemo(
        () => transformer.getVisibleColumns(),
        [transformer],
    );
    const rows = useMemo(() => transformer.getRows(), [transformer]);

    const tanstackColumns: ColumnDef<ResultRow, any>[] = useMemo(
        () =>
            columns.map((column) => ({
                id: column,
                // react table has a bug with accessors that has dots in them
                // we found the fix here -> https://github.com/TanStack/table/issues/1671
                // do not remove the line below
                accessorFn: (row) => row[column],
                header: config?.columns[column].label || column,
                cell: getRawValueCell,
            })),
        [columns, config],
    );

    const table = useReactTable({
        data: rows,
        columns: tanstackColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    const getRowHeight = useCallback(() => ROW_HEIGHT_PX, []);

    const tableWrapperRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        getScrollElement: () => tableWrapperRef.current,
        count: transformer.getRowsCount(),
        estimateSize: () => getRowHeight(),
        overscan: 25,
    });

    const getTableData = () => {
        const { rows: rowModelRows } = table.getRowModel();
        const virtualRows = virtualizer.getVirtualItems();

        return {
            headerGroups: table.getHeaderGroups(),
            virtualRows,
            rowModelRows,
        };
    };

    const paddingTop =
        virtualizer.getVirtualItems().length > 0
            ? virtualizer.getVirtualItems()[0]?.start || 0
            : 0;
    const paddingBottom =
        virtualizer.getVirtualItems().length > 0
            ? virtualizer.getTotalSize() -
              (virtualizer.getVirtualItems()[
                  virtualizer.getVirtualItems().length - 1
              ]?.end || 0)
            : 0;

    return {
        tableWrapperRef,
        columns,
        rows,
        getRowHeight,
        getRowsCount: () => transformer.getRowsCount(),
        getColumnsCount: () => transformer.getColumnsCount(),
        getTableData,
        paddingTop,
        paddingBottom,
    };
};
