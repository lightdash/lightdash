import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

const ScrollableTable = () => {
    const { footer, setTableWrapperRef, isScrollable } = useTableContext();

    return (
        <TableScrollableWrapper
            ref={setTableWrapperRef}
            $isScrollable={isScrollable}
        >
            <Table bordered condensed showFooter={!!footer?.show}>
                <TableHeader />
                <TableBody />
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
