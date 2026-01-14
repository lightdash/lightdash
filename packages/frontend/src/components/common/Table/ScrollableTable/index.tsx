import { useRef, type FC } from 'react';
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
    const { footer } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const { isDashboardRedesignEnabled } = useDashboardUIPreference();

    return (
        <TableScrollableWrapper
            ref={tableContainerRef}
            $isDashboard={isDashboard && isDashboardRedesignEnabled}
        >
            <Table $showFooter={!!footer?.show}>
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
