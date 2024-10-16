import {
    TableDataModel,
    type RawResultRow,
    type VizColumnsConfig,
} from '@lightdash/common';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef } from 'react';
import { getValueCell } from '../../../hooks/useColumns';
import { ROW_HEIGHT_PX } from '../../common/Table/Table.styles';

// This just makes a virtual table from rows and columns. It's very similar to useTableDataModel.
export const useVirtualTable = ({
    columnNames,
    rows,
    config,
}: {
    columnNames: string[];
    rows: RawResultRow[];
    config?: VizColumnsConfig;
}) => {
    const tanstackColumns: ColumnDef<RawResultRow, any>[] = useMemo(() => {
        return columnNames.map((columnName) => ({
            id: columnName,
            // react table has a bug with accessors that has dots in them
            // we found the fix here -> https://github.com/TanStack/table/issues/1671
            // do not remove the line below
            accessorFn: TableDataModel.getColumnsAccessorFn(columnName),
            header: (config && config[columnName]?.label) || columnName,
            cell: getValueCell,
        }));
    }, [columnNames, config]);

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
        columnNames,
        rows,
        getRowHeight,
        getTableData,
        paddingTop,
        paddingBottom,
    };
};
