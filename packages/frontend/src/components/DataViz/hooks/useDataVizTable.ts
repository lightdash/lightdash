import { type RawResultRow, type VizColumnsConfig } from '@lightdash/common';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef } from 'react';
import { getValueCell } from '../../../hooks/useColumns';
import { ROW_HEIGHT_PX } from '../../common/Table/Table.styles';

const defaultAccessorFn = (column: string) => (row: RawResultRow) =>
    row[column];

const useDataVizTable = (
    columns: string[],
    rows: RawResultRow[],
    columnsConfig: VizColumnsConfig,
    accessorFn: typeof defaultAccessorFn = defaultAccessorFn,
) => {
    const tanstackColumns: ColumnDef<RawResultRow, any>[] = useMemo(() => {
        return columns.map((column) => ({
            id: column,
            // react table has a bug with accessors that has dots in them
            // we found the fix here -> https://github.com/TanStack/table/issues/1671
            // do not remove the line below
            accessorFn: accessorFn(column),
            header: columnsConfig[column]?.label ?? column,
            cell: getValueCell,
        }));
    }, [columns, columnsConfig, accessorFn]);

    const table = useReactTable({
        data: rows,
        columns: tanstackColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    const getRowHeight = useCallback(() => ROW_HEIGHT_PX, []);

    const tableWrapperRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        getScrollElement: () => tableWrapperRef.current,
        count: rows.length,
        estimateSize: () => getRowHeight(),
        overscan: 25,
    });

    const getTableData = useCallback(() => {
        const { rows: rowModelRows } = table.getRowModel();
        const virtualRows = virtualizer.getVirtualItems();

        return {
            headerGroups: table.getHeaderGroups(),
            virtualRows,
            rowModelRows,
        };
    }, [table, virtualizer]);

    const paddingTop = useMemo(() => {
        return virtualizer.getVirtualItems().length > 0
            ? virtualizer.getVirtualItems()[0]?.start || 0
            : 0;
    }, [virtualizer]);

    const paddingBottom = useMemo(() => {
        return virtualizer.getVirtualItems().length > 0
            ? virtualizer.getTotalSize() -
                  (virtualizer.getVirtualItems()[
                      virtualizer.getVirtualItems().length - 1
                  ]?.end || 0)
            : 0;
    }, [virtualizer]);

    return {
        tableWrapperRef,
        columns,
        rows,
        getRowHeight,
        getRowsCount: () => rows.length,
        getColumnsCount: () => columns.length,
        getTableData,
        paddingTop,
        paddingBottom,
    };
};

export default useDataVizTable;
