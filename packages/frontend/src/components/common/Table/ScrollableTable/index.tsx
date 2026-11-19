import { useMemo, useRef, useState, type FC } from 'react';
import { ColumnWindowColGroup } from '../ColumnWindowColGroup';
import { DEFAULT_FROZEN_COLUMN_WIDTH } from '../constants';
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
    const { footer, table } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [draggedColumn, setDraggedColumn] = useState<string>();
    const headerGroups = table.getHeaderGroups();
    const columns = useMemo(
        () =>
            headerGroups.at(-1)?.headers.map(({ column }) => {
                const meta = column.columnDef.meta;
                const width = meta?.width ?? meta?.styleProps?.w;
                return {
                    id: column.id,
                    width:
                        typeof width === 'number'
                            ? width
                            : meta?.frozen
                              ? DEFAULT_FROZEN_COLUMN_WIDTH
                              : column.getSize(),
                    pinned:
                        column.id === draggedColumn ||
                        meta?.className?.includes('sticky-column'),
                };
            }) ?? [],
        [headerGroups, draggedColumn],
    );
    const columnWindow = useColumnWindow(tableContainerRef, columns);

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
                    onDragColumnChange={setDraggedColumn}
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
