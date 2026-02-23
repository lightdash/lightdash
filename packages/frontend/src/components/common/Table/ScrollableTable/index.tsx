import { useMemo, useRef, type FC } from 'react';
import { useIsTableColumnWidthStabilizationEnabled } from '../../../../hooks/useIsTableColumnWidthStabilizationEnabled';
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
    const { footer, columns } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const isTableColumnWidthStabilizationEnabled =
        useIsTableColumnWidthStabilizationEnabled();

    const totalColumnWidth = useMemo(() => {
        if (!isTableColumnWidthStabilizationEnabled) return 0;
        const total = columns.reduce(
            (sum, col) => sum + (col.meta?.width ?? 0),
            0,
        );
        return total > 0 ? total : 0;
    }, [columns, isTableColumnWidthStabilizationEnabled]);

    return (
        <TableScrollableWrapper
            ref={tableContainerRef}
            $isDashboard={isDashboard}
        >
            <Table
                $showFooter={!!footer?.show}
                $fixedLayout={
                    isTableColumnWidthStabilizationEnabled
                        ? totalColumnWidth
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
