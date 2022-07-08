import React from 'react';
import { Table, TableScrollableWrapper } from '../Table.styles';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

const ScrollableTable = () => {
    return (
        <TableScrollableWrapper>
            <Table bordered condensed>
                <TableHeader />
                <TableBody />
                <TableFooter />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
