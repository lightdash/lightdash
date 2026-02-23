import {
    TableDataModel,
    type IResultsRunner,
    type RawResultRow,
    type VizTableColumnsConfig,
} from '@lightdash/common';
import {
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useMemo, useRef } from 'react';
import { useAutoColumnWidths } from '../../../hooks/useAutoColumnWidths';
import { getValueCell } from '../../../hooks/useColumns';
import { ROW_HEIGHT_PX } from '../../common/Table/constants';
import { calculateColumnStats } from '../utils/columnStats';

// TODO: this name could change or we could replace this with useVirtualTable.
// It's not really clear what is doing with the table data model for a consumer.
export const useTableDataModel = ({
    config,
    resultsRunner,
}: {
    config: VizTableColumnsConfig | undefined;
    resultsRunner: IResultsRunner;
}) => {
    const tableModel = useMemo(() => {
        return new TableDataModel({
            resultsRunner,
            columnsConfig: config?.columns,
        });
    }, [resultsRunner, config]);

    const columns = useMemo(() => tableModel.getVisibleColumns(), [tableModel]);
    const rows = useMemo(() => tableModel.getRows(), [tableModel]);

    // Calculate stats for columns with bar display style
    const columnStats = useMemo(() => {
        if (!config?.columns) return {};

        // Find columns that need bar chart display
        const barColumns = columns.filter(
            (col) => config?.columns?.[col]?.displayStyle === 'bar',
        );

        if (barColumns.length === 0) return {};

        return calculateColumnStats(rows, barColumns);
    }, [rows, columns, config?.columns]);

    const headerLabels = useMemo(() => {
        if (!config?.columns) return {};
        const labels: Record<string, string> = {};
        for (const col of columns) {
            labels[col] = config.columns[col]?.label || col;
        }
        return labels;
    }, [columns, config?.columns]);

    const getCellText = useCallback(
        (row: Record<string, unknown>, colId: string) =>
            String(row[colId] ?? ''),
        [],
    );

    const autoColumnWidths = useAutoColumnWidths({
        columnIds: columns,
        rows,
        getCellText,
        headerLabels,
    });

    const tanstackColumns: ColumnDef<RawResultRow, any>[] = useMemo(() => {
        return columns.map((column) => {
            const autoWidth = autoColumnWidths[column];
            return {
                id: column,
                // react table has a bug with accessors that has dots in them
                // we found the fix here -> https://github.com/TanStack/table/issues/1671
                // do not remove the line below
                accessorFn: TableDataModel.getColumnsAccessorFn(column),
                header: config?.columns[column].label || column,
                cell: getValueCell,
                ...(autoWidth
                    ? {
                          meta: {
                              style: {
                                  width: autoWidth,
                                  minWidth: autoWidth,
                                  maxWidth: autoWidth,
                              },
                          },
                      }
                    : {}),
            };
        });
    }, [columns, config?.columns, autoColumnWidths]);

    const table = useReactTable({
        data: rows,
        columns: tanstackColumns,
        getCoreRowModel: getCoreRowModel(),
        meta: {
            columnStats,
            columnsConfig: config?.columns ?? undefined,
        },
    });

    const getRowHeight = useCallback(() => ROW_HEIGHT_PX, []);

    const tableWrapperRef = useRef<HTMLDivElement>(null);

    const virtualizer = useVirtualizer({
        getScrollElement: () => tableWrapperRef.current,
        count: tableModel.getRowsCount(),
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
        getRowsCount: () => tableModel.getRowsCount(),
        getColumnsCount: () => tableModel.getColumnsCount(),
        getTableData,
        paddingTop,
        paddingBottom,
    };
};
