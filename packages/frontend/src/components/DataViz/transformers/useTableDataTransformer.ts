import { type ResultRow, type SqlTableConfig } from '@lightdash/common';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef } from 'react';
import { ROW_HEIGHT_PX } from '../../common/Table/Table.styles';
import { TableDataTransformer } from './TableDataTransformer';

export const useTableDataTransformer = (
    data: ResultRow[],
    config: SqlTableConfig | undefined,
) => {
    const transformer = useMemo(
        () => new TableDataTransformer(data, config),
        [data, config],
    );

    const columns = useMemo(() => transformer.getColumns(), [transformer]);
    const rows = useMemo(() => transformer.getRows(), [transformer]);

    const table = useReactTable({
        data: rows,
        columns,
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
