import { useRef, type FC } from 'react';
import { Table, TableScrollableWrapper } from '../Table.styles';
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
    const { footer } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);

    return (
        <TableScrollableWrapper
            ref={tableContainerRef}
            $isDashboard={isDashboard}
        >
            <Table $showFooter={!!footer?.show}>
                <TableHeader minimal={minimal} showSubtotals={showSubtotals} />
                <TableBody
                    tableContainerRef={tableContainerRef}
                    minimal={minimal}
                    showSubtotals={showSubtotals}
                    showRowGrouping={showRowGrouping}
                />
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
