import {
    TableDataModel,
    type RawResultRow,
    type VizColumnsConfig,
} from '@lightdash/common';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
    type TableOptions,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef } from 'react';
import { getJsonValueCell, getValueCell } from '../../../hooks/useColumns';
import { ROW_HEIGHT_PX } from '../../common/Table/constants';
import { useColumnWindow } from '../../common/Table/useColumnWindow';

export const useVirtualTable = ({
    columnNames,
    rows,
    columnsConfig,
    enableJsonViewer = false,
    isCompact,
    meta,
}: {
    columnNames: string[];
    rows: RawResultRow[];
    columnsConfig?: VizColumnsConfig;
    enableJsonViewer?: boolean;
    isCompact: boolean;
    meta?: TableOptions<RawResultRow>['meta'];
}) => {
    const viewport = useRef<HTMLDivElement>(null);
    const columns: ColumnDef<RawResultRow, any>[] = useMemo(
        () =>
            columnNames.map((name) => ({
                id: name,
                accessorFn: TableDataModel.getColumnsAccessorFn(name),
                header: columnsConfig?.[name]?.label || name,
                cell: enableJsonViewer ? getJsonValueCell : getValueCell,
            })),
        [columnNames, columnsConfig, enableJsonViewer],
    );
    const table = useReactTable({
        data: rows,
        columns,
        getCoreRowModel: getCoreRowModel(),
        meta,
    });
    const headers = table.getFlatHeaders();
    const layout = useMemo(() => {
        const dataColumns = headers.map(({ id, getSize }) => ({
            id: `field:${id}`,
            width: getSize(),
        }));
        return isCompact
            ? [{ id: 'row-number', width: 40 }, ...dataColumns]
            : dataColumns;
    }, [headers, isCompact]);
    const columnWindow = useColumnWindow(viewport, layout);

    const rowVirtualizer = useVirtualizer({
        getScrollElement: () => viewport.current,
        count: rows.length,
        estimateSize: () => (isCompact ? 28 : ROW_HEIGHT_PX),
        overscan: 25,
    });
    const virtualRows = rowVirtualizer.getVirtualItems();

    return {
        viewport,
        headers,
        columnWindow,
        columnCount: layout.length,
        virtualRows,
        table,
        paddingTop: virtualRows[0]?.start ?? 0,
        paddingBottom: virtualRows.length
            ? rowVirtualizer.getTotalSize() -
              virtualRows[virtualRows.length - 1].end
            : 0,
    };
};
