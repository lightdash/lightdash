import { type ComponentProps, type FC } from 'react';
import {
    ExploreEmptyQueryState,
    ExploreIdleState,
    ExploreLoadingState,
} from '../../Explorer/ResultsCard/ExplorerResultsNonIdealStates';
import ScrollableTable from './ScrollableTable';
import { TableContainer } from './Table.styles';
import TablePagination from './TablePagination';
import { TableProvider } from './TableProvider';

type Props = ComponentProps<typeof TableProvider> & {
    status: 'idle' | 'loading' | 'success' | 'error';
    loadingState?: FC<React.PropsWithChildren<{}>>;
    idleState?: FC<React.PropsWithChildren<{}>>;
    emptyState?: FC<React.PropsWithChildren<{}>>;
    className?: string;
    minimal?: boolean;
    showSubtotals?: boolean;
    $shouldExpand?: boolean;
    $padding?: number;
    'data-testid'?: string;
};

const Table: FC<React.PropsWithChildren<Props>> = ({
    $shouldExpand,
    $padding,
    status,
    loadingState,
    idleState,
    emptyState,
    className,
    minimal = false,
    showSubtotals = true,
    'data-testid': dataTestId,
    ...rest
}) => {
    const LoadingState = loadingState || ExploreLoadingState;
    const IdleState = idleState || ExploreIdleState;
    const EmptyState = emptyState || ExploreEmptyQueryState;

    // TODO: data comes empty
    return (
        <TableProvider {...rest}>
            <TableContainer
                className={`sentry-block ph-no-capture ${
                    className ? ` ${className}` : ''
                }`}
                $shouldExpand={$shouldExpand}
                $padding={$padding}
                data-testid={dataTestId}
            >
                <ScrollableTable
                    minimal={minimal}
                    showSubtotals={showSubtotals}
                />

                {status === 'loading' && <LoadingState />}
                {status === 'idle' && <IdleState />}
                {status === 'success' && rest.data?.length === 0 && (
                    <EmptyState />
                )}

                <TablePagination />
            </TableContainer>
        </TableProvider>
    );
};

export default Table;
