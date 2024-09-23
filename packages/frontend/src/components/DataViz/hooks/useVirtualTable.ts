import { TableDataModel, type RawResultRow } from '@lightdash/common';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef } from 'react';
import { getValueCell } from '../../../hooks/useColumns';
import { ROW_HEIGHT_PX } from '../../common/Table/Table.styles';

// TODO: This is meant to replace useTableDataModel
export const useVirtualTable = ({
    tableDataModel,
}: {
    tableDataModel: TableDataModel;
}) => {
    const columns = useMemo(
        () => tableDataModel.getVisibleColumns(),
        [tableDataModel],
    );
    const rows = useMemo(() => tableDataModel.getRows(), [tableDataModel]);
    const config = useMemo(() => tableDataModel.getConfig(), [tableDataModel]);

    const tanstackColumns: ColumnDef<RawResultRow, any>[] = useMemo(() => {
        return columns.map((column) => ({
            id: column,
            // react table has a bug with accessors that has dots in them
            // we found the fix here -> https://github.com/TanStack/table/issues/1671
            // do not remove the line below
            accessorFn: TableDataModel.getColumnsAccessorFn(column),
            header: config.columns[column].label || column,
            cell: getValueCell,
        }));
    }, [columns, config.columns]);

    const table = useReactTable({
        data: rows,
        columns: tanstackColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    const getRowHeight = useCallback(() => ROW_HEIGHT_PX, []);

    const tableWrapperRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        getScrollElement: () => tableWrapperRef.current,
        count: tableDataModel.getRowsCount(),
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
        getTableData,
        paddingTop,
        paddingBottom,
    };
};
