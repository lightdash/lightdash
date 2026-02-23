import {
    FeatureFlags,
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
import { useAutoColumnWidths } from '../../../hooks/useAutoColumnWidths';
import { getValueCell } from '../../../hooks/useColumns';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { ROW_HEIGHT_PX } from '../../common/Table/constants';

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
    const headerLabels = useMemo(() => {
        if (!config) return {};
        const labels: Record<string, string> = {};
        for (const col of columnNames) {
            labels[col] = config[col]?.label || col;
        }
        return labels;
    }, [columnNames, config]);

    const getCellText = useCallback(
        (row: Record<string, unknown>, colId: string) =>
            String(row[colId] ?? ''),
        [],
    );

    const { data: tableColumnWidthStabilizationFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTableColumnWidthStabilization,
    );
    const isTableColumnWidthStabilizationEnabled =
        tableColumnWidthStabilizationFlag?.enabled ?? false;

    const autoColumnWidths = useAutoColumnWidths({
        columnIds: columnNames,
        rows,
        getCellText,
        headerLabels,
        enabled: isTableColumnWidthStabilizationEnabled,
    });

    const tanstackColumns: ColumnDef<RawResultRow, any>[] = useMemo(() => {
        return columnNames.map((columnName) => {
            const autoWidth = autoColumnWidths[columnName];
            return {
                id: columnName,
                // react table has a bug with accessors that has dots in them
                // we found the fix here -> https://github.com/TanStack/table/issues/1671
                // do not remove the line below
                accessorFn: TableDataModel.getColumnsAccessorFn(columnName),
                header: (config && config[columnName]?.label) || columnName,
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
    }, [columnNames, config, autoColumnWidths]);

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
