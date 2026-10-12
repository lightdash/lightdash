import { type ApiErrorDetail } from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type ComponentProps, type FC } from 'react';
import {
    ExploreEmptyQueryState,
    ExploreErrorState,
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
    errorDetail?: ApiErrorDetail | null;
    isDashboard?: boolean;
    /** Fills a framed pane: no border, radius or footer */
    flush?: boolean;
};

const Table: FC<React.PropsWithChildren<Props>> = ({
    isDashboard = false,
    flush = false,
    $shouldExpand,
    $padding,
    status,
    loadingState,
    idleState,
    emptyState,
    className,
    minimal = false,
    showSubtotals = true,
    showRowGrouping = false,
    'data-testid': dataTestId,
    errorDetail,
    ...rest
}) => {
    const theme = useMantineTheme();
    const LoadingState = loadingState || ExploreLoadingState;
    const IdleState = idleState || ExploreIdleState;
    const EmptyState = emptyState || ExploreEmptyQueryState;

    if (status === 'loading') {
        return <LoadingState />;
    }

    return (
        <TableProvider {...rest}>
            <TableContainer
                className={`sentry-block ph-no-capture ${
                    className ? ` ${className}` : ''
                }`}
                $shouldExpand={$shouldExpand}
                $padding={$padding}
                data-testid={dataTestId}
                $tableFont={theme.other.tableFont}
            >
                <ScrollableTable
                    minimal={minimal}
                    showSubtotals={showSubtotals}
                    showRowGrouping={showRowGrouping}
                    isDashboard={isDashboard}
                    flush={flush}
                />

                {status === 'error' && (
                    <ExploreErrorState errorDetail={errorDetail} />
                )}
                {status === 'idle' && <IdleState />}
                {status === 'success' && rest.data.length === 0 && (
                    <EmptyState />
                )}

                {!flush && <TablePagination />}
            </TableContainer>
        </TableProvider>
    );
};

export default Table;
