import { FC } from 'react';
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

    return (
        <TableScrollableWrapper>
            <Table bordered condensed showFooter={!!footer?.show}>
                <TableHeader />
                <TableBody />
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
