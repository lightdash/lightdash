import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

const ScrollableTable = () => {
    const { footer, isFullWidth, scrollableWrapperRef } = useTableContext();

    return (
        <TableScrollableWrapper
            ref={(ref) => (scrollableWrapperRef.current = ref || undefined)}
        >
            <Table
                bordered
                condensed
                showFooter={!!footer?.show}
                isFullWidth={isFullWidth}
            >
                <TableHeader />
                <TableBody />
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
