import { useContext, useMemo, useRef, useState, type FC } from 'react';
import { ColumnWindowColGroup } from '../ColumnWindowColGroup';
import {
    COLUMN_VIRTUALIZATION_THRESHOLD,
    DEFAULT_FROZEN_COLUMN_WIDTH,
    ROW_NUMBER_COLUMN_ID,
} from '../constants';
import {
    COLUMN_WIDTH_SAMPLE_ROWS,
    getRowNumberWidth,
    measureColumnWidth,
    measureExploreColumn,
} from '../measureColumnWidth';
import { StaticTableRenderContext } from '../StaticTableRenderContext';
import { Table, TableScrollableWrapper } from '../Table.styles';
import { useColumnWindow } from '../useColumnWindow';
import { useTableContext } from '../useTableContext';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

interface ScrollableTableProps {
    minimal?: boolean;
    showSubtotals?: boolean;
    showRowGrouping?: boolean;
    isDashboard?: boolean;
}

const ScrollableTable: FC<ScrollableTableProps> = ({
    minimal = true,
    showSubtotals = true,
    showRowGrouping = false,
    isDashboard = false,
}) => {
    const {
        footer,
        table,
        data,
        headerContextMenu,
        totalRowsCount,
        exploreResults,
    } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [draggedColumn, setDraggedColumn] = useState<string>();
    const [focusedColumn, setFocusedColumn] = useState<string>();
    const headerGroups = table.getHeaderGroups();
    const leafHeaders = headerGroups.at(-1)?.headers;
    const dataColumnCount =
        (leafHeaders?.length ?? 0) -
        (leafHeaders?.[0]?.column.id === ROW_NUMBER_COLUMN_ID ? 1 : 0);
    const staticRender = useContext(StaticTableRenderContext);
    const windowed =
        !staticRender && dataColumnCount > COLUMN_VIRTUALIZATION_THRESHOLD;
    const sizedColumns = useMemo(() => {
        const samples = windowed ? data.slice(0, COLUMN_WIDTH_SAMPLE_ROWS) : [];
        return (
            leafHeaders?.map(({ column }) => {
                const { header, meta } = column.columnDef;
                const explicitWidth = meta?.width ?? meta?.styleProps?.w;
                let width = column.getSize();
                let headerHeight = 0;
                if (
                    windowed &&
                    column.id === ROW_NUMBER_COLUMN_ID &&
                    !meta?.className?.includes('sticky-column')
                ) {
                    width = getRowNumberWidth(
                        Math.max(totalRowsCount, data.length),
                        !!footer?.show,
                    );
                } else if (typeof explicitWidth === 'number') {
                    width = explicitWidth;
                } else if (meta?.frozen) {
                    width = DEFAULT_FROZEN_COLUMN_WIDTH;
                } else if (windowed) {
                    const label =
                        meta?.headerText ??
                        meta?.labelOverride ??
                        (typeof header === 'string' ? header : column.id);
                    const menuWidth =
                        headerContextMenu && !meta?.isReadOnly ? 24 : 0;
                    const values = samples.map(
                        (row) => row[column.id]?.value.formatted ?? '',
                    );
                    if (exploreResults) {
                        const size = measureExploreColumn(
                            label,
                            values,
                            meta?.headerIconWidth ?? 0,
                        );
                        width = size.width;
                        headerHeight = size.headerHeight;
                    } else {
                        width = measureColumnWidth(
                            label,
                            values,
                            (meta?.headerIconWidth ?? 0) + menuWidth,
                        );
                    }
                }
                return {
                    headerHeight,
                    id: column.id,
                    width,
                    pinned: !!meta?.className?.includes('sticky-column'),
                };
            }) ?? []
        );
    }, [
        leafHeaders,
        data,
        totalRowsCount,
        windowed,
        headerContextMenu,
        exploreResults,
        footer?.show,
    ]);
    const headerHeight = useMemo(
        () =>
            sizedColumns.reduce(
                (height, column) => Math.max(height, column.headerHeight),
                0,
            ),
        [sizedColumns],
    );
    const columns = useMemo(
        () =>
            sizedColumns.map((column) => ({
                ...column,
                pinned:
                    column.pinned ||
                    column.id === draggedColumn ||
                    column.id === focusedColumn,
            })),
        [sizedColumns, draggedColumn, focusedColumn],
    );
    const columnWindow = useColumnWindow(
        tableContainerRef,
        columns,
        dataColumnCount,
    );

    return (
        <TableScrollableWrapper
            ref={tableContainerRef}
            $isDashboard={isDashboard}
        >
            <Table
                $showFooter={!!footer?.show}
                $virtualWidth={columnWindow?.width}
                aria-colcount={columnWindow ? columns.length : undefined}
            >
                <ColumnWindowColGroup columnWindow={columnWindow} />
                <TableHeader
                    headerHeight={headerHeight || undefined}
                    onDragColumnChange={setDraggedColumn}
                    onFocusColumnChange={setFocusedColumn}
                    minimal={minimal}
                    showSubtotals={showSubtotals}
                    columnWindow={columnWindow}
                />
                <TableBody
                    tableContainerRef={tableContainerRef}
                    minimal={minimal}
                    showSubtotals={showSubtotals}
                    showRowGrouping={showRowGrouping}
                    columnWindow={columnWindow}
                />
                <TableFooter columnWindow={columnWindow} />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
