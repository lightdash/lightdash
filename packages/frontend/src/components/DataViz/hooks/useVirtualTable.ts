import {
    TableDataModel,
    type DimensionType,
    type RawResultRow,
    type VizColumnsConfig,
    type VizTableHeaderSortConfig,
} from '@lightdash/common';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
    type TableOptions,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useContext, useMemo, useRef } from 'react';
import { getJsonValueCell, getValueCell } from '../../../hooks/useColumns';
import { getJsonCellValue } from '../../common/JsonViewer/utils';
import { ColumnWindowingContext } from '../../common/Table/ColumnWindowingContext';
import {
    COLUMN_VIRTUALIZATION_THRESHOLD,
    ROW_HEIGHT_PX,
} from '../../common/Table/constants';
import {
    COLUMN_WIDTH_SAMPLE_ROWS,
    MAX_COLUMN_WIDTH,
    getRowNumberWidth,
    measureColumnWidth,
} from '../../common/Table/measureColumnWidth';
import { useColumnWindow } from '../../common/Table/useColumnWindow';
import { formatRowValueFromWarehouse } from '../formatters/formatRowValueFromWarehouse';

const compactPadding = { header: 20, body: 20 };

export const useVirtualTable = ({
    columnNames,
    rows,
    columnsConfig,
    columnTypes,
    sortConfig,
    enableJsonViewer = false,
    isCompact,
    meta,
}: {
    columnNames: string[];
    rows: RawResultRow[];
    columnsConfig?: VizColumnsConfig;
    columnTypes?: Record<string, DimensionType>;
    sortConfig?: VizTableHeaderSortConfig;
    enableJsonViewer?: boolean;
    isCompact: boolean;
    meta?: TableOptions<RawResultRow>['meta'];
}) => {
    const viewport = useRef<HTMLDivElement>(null);
    const windowingEnabled = useContext(ColumnWindowingContext);
    const columns: ColumnDef<RawResultRow, any>[] = useMemo(
        () =>
            columnNames.map((name) => ({
                id: name,
                // SQL aliases can contain literal dots, which accessorKey treats as nested paths.
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
        if (
            !windowingEnabled ||
            headers.length <= COLUMN_VIRTUALIZATION_THRESHOLD
        )
            return [];
        const sample = rows.slice(0, COLUMN_WIDTH_SAMPLE_ROWS);
        const padding = isCompact ? compactPadding : undefined;
        const dataColumns = headers.map(({ id }) => {
            const fieldId = `field:${id}`;
            if (sample.some((row) => getJsonCellValue(row[id]))) {
                return { id: fieldId, width: MAX_COLUMN_WIDTH };
            }
            const config = columnsConfig?.[id];
            const label = [config?.aggregation, config?.label || id]
                .filter(Boolean)
                .join(' ');
            const values = sample.map((row) => {
                const value = row[id];
                if (isCompact && value == null) return 'null';
                return formatRowValueFromWarehouse(value);
            });
            if (isCompact && columnTypes?.[id]) values.push(columnTypes[id]);
            return {
                id: fieldId,
                width: measureColumnWidth(
                    label,
                    values,
                    (sortConfig?.[id]?.direction ? 20 : 0) +
                        (config?.aggregation ? 16 : 0),
                    padding,
                ),
            };
        });
        return isCompact
            ? [
                  {
                      id: 'row-number',
                      width: Math.max(
                          40,
                          getRowNumberWidth(rows.length, false, compactPadding),
                      ),
                  },
                  ...dataColumns,
              ]
            : dataColumns;
    }, [
        headers,
        isCompact,
        windowingEnabled,
        rows,
        columnsConfig,
        columnTypes,
        sortConfig,
    ]);
    const columnWindow = useColumnWindow(viewport, layout, headers.length);

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
        columnCount: headers.length + Number(isCompact),
        virtualRows,
        table,
        paddingTop: virtualRows[0]?.start ?? 0,
        paddingBottom: virtualRows.length
            ? rowVirtualizer.getTotalSize() -
              virtualRows[virtualRows.length - 1].end
            : 0,
    };
};
