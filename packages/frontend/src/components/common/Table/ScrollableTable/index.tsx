import { FC, useRef } from 'react';
import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';
import TableMenu from './TableMenu';

interface ScrollableTableProps {
    minimal?: boolean;
}

const ScrollableTable: FC<ScrollableTableProps> = ({ minimal = true }) => {
    const footer = useTableContext((context) => context.footer);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    return (
        <>
            <TableScrollableWrapper ref={tableContainerRef}>
                <Table $showFooter={!!footer?.show}>
                    <TableHeader minimal={minimal} />
                    <TableBody
                        tableContainerRef={tableContainerRef}
                        minimal={minimal}
                    />
                    <TableFooter />
                </Table>
            </TableScrollableWrapper>

            <TableMenu />
        </>
    );
};

export default ScrollableTable;
