import React, { FC } from 'react';
import ScrollableTable from './ScrollableTable';
import { TableContainer } from './Table.styles';
import TablePagination from './TablePagination';
import { TableProvider } from './TableProvider';
import {
    CellContextMenuProps,
    HeaderProps,
    TableColumn,
    TableRow,
} from './types';

type Props = {
    data: TableRow[];
    columns: TableColumn[];
    headerContextMenu?: FC<HeaderProps>;
    headerButton?: FC<HeaderProps>;
    cellContextMenu?: FC<CellContextMenuProps>;
};

const ResultsTable: FC<Props> = (props) => {
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
