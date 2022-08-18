import React, { ComponentProps, FC } from 'react';
import ScrollableTable from './ScrollableTable';
import * as States from './States';
import { TableContainer } from './Table.styles';
import TablePagination from './TablePagination';
import { TableProvider } from './TableProvider';

type Props = ComponentProps<typeof TableProvider> & {
    status: 'idle' | 'loading' | 'success' | 'error';
    loadingState?: FC;
    idleState?: FC;
    emptyState?: FC;
};

const ResultsTable: FC<Props> = ({
    status,
    loadingState,
    idleState,
    emptyState,
    ...rest
}) => {
    const LoadingState = loadingState || States.LoadingState;
    const IdleState = idleState || States.IdleState;
    const EmptyState = emptyState || States.EmptyState;

    return (
        <TableProvider {...rest}>
            <TableContainer className="cohere-block">
                <ScrollableTable />
                {status === 'loading' && <LoadingState />}
                {status === 'idle' && <IdleState />}
                {status === 'success' && rest.data.length === 0 && (
                    <EmptyState />
                )}
                <TablePagination />
            </TableContainer>
        </TableProvider>
    );
};

export default ResultsTable;
