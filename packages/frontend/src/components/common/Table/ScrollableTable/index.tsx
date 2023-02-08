import { FC, useRef } from 'react';
import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

interface ScrollableTableProps {
    $shouldExpand?: boolean;
}

const ScrollableTable: FC<ScrollableTableProps> = ({ $shouldExpand }) => {
    const { footer } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    return (
        <TableScrollableWrapper ref={tableContainerRef}>
            <Table bordered condensed $showFooter={!!footer?.show}>
                <TableHeader />
                <TableBody tableContainerRef={tableContainerRef} />
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
