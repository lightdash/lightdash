import { useCallback, useMemo, useRef, type FC } from 'react';
import { useIsTableColumnWidthStabilizationEnabled } from '../../../../hooks/useIsTableColumnWidthStabilizationEnabled';
import { useMeasureAndLockColumns } from '../../../../hooks/useMeasureAndLockColumns';
import { useResizeObserver } from '../../../../hooks/useResizeObserver';
import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../useTableContext';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

interface ScrollableTableProps {
    minimal?: boolean;
    showSubtotals?: boolean;
    isDashboard?: boolean;
}

const ScrollableTable: FC<ScrollableTableProps> = ({
    minimal = true,
    showSubtotals = true,
    isDashboard = false,
}) => {
    const { footer, columns, data } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);

    const isTableColumnWidthStabilizationEnabled =
        useIsTableColumnWidthStabilizationEnabled();

    const [setResizeRef, containerRect] = useResizeObserver<HTMLDivElement>();

    const combinedRef = useCallback(
        (el: HTMLDivElement | null) => {
            (
                tableContainerRef as React.MutableRefObject<HTMLDivElement | null>
            ).current = el;
            if (isTableColumnWidthStabilizationEnabled) setResizeRef(el);
        },
        [setResizeRef, isTableColumnWidthStabilizationEnabled],
    );

    const containerWidth = isTableColumnWidthStabilizationEnabled
        ? containerRect.width
        : 0;

    const columnKey = useMemo(
        () => columns.map((col) => col.id ?? '').join('\0'),
        [columns],
    );

    // Extract user-customized widths from column meta so the colgroup respects them
    const customWidths = useMemo(
        () => columns.map((col) => col.meta?.width as number | undefined),
        [columns],
    );

    const { columnWidths, totalWidth } = useMeasureAndLockColumns({
        tableRef,
        enabled: isTableColumnWidthStabilizationEnabled,
        columnKey,
        hasData: data.length > 0,
        containerWidth,
        customWidths,
    });

    return (
        <TableScrollableWrapper ref={combinedRef} $isDashboard={isDashboard}>
            <Table
                ref={tableRef}
                $showFooter={!!footer?.show}
                $totalColumnWidth={totalWidth}
            >
                {columnWidths !== null && (
                    <colgroup>
                        {columnWidths.map((w, i) => (
                            <col key={i} style={{ width: w }} />
                        ))}
                    </colgroup>
                )}
                <TableHeader minimal={minimal} showSubtotals={showSubtotals} />
                <TableBody
                    tableContainerRef={tableContainerRef}
                    minimal={minimal}
                />
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
