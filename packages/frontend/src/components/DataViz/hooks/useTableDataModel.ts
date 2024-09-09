import {
    ChartKind,
    TableDataModel,
    type IResultsRunner,
    type RawResultRow,
    type VizChartLayout,
    type VizTableColumnsConfig,
    type VizTableConfig,
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

export const useTableDataModel = <T extends IResultsRunner<VizChartLayout>>({
    config,
    resultsRunner,
}: {
    config: VizTableColumnsConfig | undefined;
    resultsRunner: T;
}) => {
    const tableModel = useMemo(() => {
        // TODO: currently usage of this hook relies just on columns, change to rely on full config so we don't have to create a dummy config
        const tableConfig: VizTableConfig | undefined = config
            ? {
                  type: ChartKind.TABLE,
                  metadata: {
                      version: 1,
                  },
                  columns: config?.columns ?? {},
              }
            : undefined;

        return new TableDataModel({
            resultsRunner,
            config: tableConfig,
        });
    }, [resultsRunner, config]);

    const columns = useMemo(() => tableModel.getVisibleColumns(), [tableModel]);
    const rows = useMemo(() => tableModel.getRows(), [tableModel]);

    const tanstackColumns: ColumnDef<RawResultRow, any>[] = useMemo(() => {
        return columns.map((column) => ({
            id: column,
            // react table has a bug with accessors that has dots in them
            // we found the fix here -> https://github.com/TanStack/table/issues/1671
            // do not remove the line below
            accessorFn: resultsRunner.getColumnsAccessorFn(column),
            header: config?.columns[column].label || column,
            cell: getValueCell,
        }));
    }, [columns, config?.columns, resultsRunner]);

    const table = useReactTable({
        data: rows,
        columns: tanstackColumns,
        getCoreRowModel: getCoreRowModel(),
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
