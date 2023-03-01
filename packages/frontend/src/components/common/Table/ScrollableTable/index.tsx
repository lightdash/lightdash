import { FC, useRef } from 'react';
import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { TableBody, VirtualizedTableBody } from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

interface ScrollableTableProps {
    virtualized?: boolean;
}

const ScrollableTable: FC<ScrollableTableProps> = ({ virtualized = true }) => {
    const { footer } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    return (
        <TableScrollableWrapper ref={tableContainerRef}>
            <Table $showFooter={!!footer?.show}>
                <TableHeader />
                {virtualized ? (
                    <VirtualizedTableBody
                        tableContainerRef={tableContainerRef}
                    />
                ) : (
                    <TableBody />
                )}
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
