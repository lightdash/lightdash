import React, { ComponentProps, FC } from 'react';
import ScrollableTable from './ScrollableTable';
import { TableContainer } from './Table.styles';
import TablePagination from './TablePagination';
import { TableProvider } from './TableProvider';

const ResultsTable: FC<ComponentProps<typeof TableProvider>> = (props) => {
    return (
        <TableProvider {...props}>
            <TableContainer className="cohere-block">
                <ScrollableTable />
                <TablePagination />
            </TableContainer>
        </TableProvider>
    );
};

export default ResultsTable;
