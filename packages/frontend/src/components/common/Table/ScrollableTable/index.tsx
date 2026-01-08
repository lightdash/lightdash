import { useMemo, useRef, type FC } from 'react';
import { useDashboardUIPreference } from '../../../../hooks/dashboard/useDashboardUIPreference';
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
    const { footer, columnSizing } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const { isDashboardRedesignEnabled } = useDashboardUIPreference();

    // Calculate total table width when column resizing is enabled
    const tableWidth = useMemo(() => {
        if (!columnSizing.enabled || !columnSizing.isReady) return undefined;

        const sizableColumnsWidth = Object.values(
            columnSizing.columnWidths,
        ).reduce((sum, width) => sum + width, 0);

        // Total width = frozen columns (row numbers + pinned) + sizable columns
        return columnSizing.frozenTotalWidth + sizableColumnsWidth;
    }, [
        columnSizing.enabled,
        columnSizing.isReady,
        columnSizing.columnWidths,
        columnSizing.frozenTotalWidth,
    ]);

    // Shrink to fit content when:
    // - Columns have been resized AND not currently resizing, OR
    // - Currently resizing AND there were locked widths before this resize started
    // This prevents jumping on the first resize but allows shrinking during subsequent resizes
    const isResizing = !!columnSizing.resizingColumnId;
    const shouldShrinkToFit =
        columnSizing.enabled &&
        columnSizing.isReady &&
        columnSizing.hasLockedWidths &&
        (!isResizing || columnSizing.hadLockedWidthsBeforeResize);

    return (
        <TableScrollableWrapper
            ref={tableContainerRef}
            $isDashboard={isDashboard && isDashboardRedesignEnabled}
            style={
                shouldShrinkToFit
                    ? { width: 'fit-content', maxWidth: '100%' }
                    : undefined
            }
        >
            <Table
                $showFooter={!!footer?.show}
                style={
                    tableWidth !== undefined
                        ? { width: tableWidth, minWidth: tableWidth }
                        : undefined
                }
            >
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
