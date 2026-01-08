import { type ApiErrorDetail } from '@lightdash/common';
import { useMantineTheme } from '@mantine/core';
import { type ComponentProps, type FC } from 'react';
import { useResizeObserver } from '../../../hooks/useResizeObserver';
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
import { useTableContext } from './useTableContext';

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
};

// Inner component that can access the table context
const TableContent: FC<{
    containerRef: (element: HTMLDivElement | null) => void;
    className?: string;
    $shouldExpand?: boolean;
    $padding?: number;
    dataTestId?: string;
    status: Props['status'];
    minimal: boolean;
    showSubtotals: boolean;
    isDashboard: boolean;
    errorDetail?: ApiErrorDetail | null;
    EmptyState: FC<React.PropsWithChildren<{}>>;
    IdleState: FC<React.PropsWithChildren<{}>>;
}> = ({
    containerRef,
    className,
    $shouldExpand,
    $padding,
    dataTestId,
    status,
    minimal,
    showSubtotals,
    isDashboard,
    errorDetail,
    EmptyState,
    IdleState,
}) => {
    const theme = useMantineTheme();
    const { columnSizing, data } = useTableContext();

    // Shrink to fit content when:
    // - Columns have been resized AND not currently resizing, OR
    // - Currently resizing AND there were locked widths before this resize started
    // This prevents jumping on the first resize but allows shrinking during subsequent resizes
    const isResizing = !!columnSizing.resizingColumnId;
    const shouldFitContent =
        columnSizing.enabled &&
        columnSizing.isReady &&
        columnSizing.hasLockedWidths &&
        (!isResizing || columnSizing.hadLockedWidthsBeforeResize);

    return (
        <TableContainer
            ref={containerRef}
            className={`sentry-block ph-no-capture ${
                className ? ` ${className}` : ''
            }`}
            $shouldExpand={$shouldExpand}
            $padding={$padding}
            data-testid={dataTestId}
            $tableFont={theme.other.tableFont}
            $fitContent={shouldFitContent}
        >
            <ScrollableTable
                minimal={minimal}
                showSubtotals={showSubtotals}
                isDashboard={isDashboard}
            />

            {status === 'error' && (
                <ExploreErrorState errorDetail={errorDetail} />
            )}
            {status === 'idle' && <IdleState />}
            {status === 'success' && data.length === 0 && <EmptyState />}

            <TablePagination />
        </TableContainer>
    );
};

const Table: FC<React.PropsWithChildren<Props>> = ({
    isDashboard = false,
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
    errorDetail,
    ...rest
}) => {
    const [containerRef, containerRect] = useResizeObserver<HTMLDivElement>();
    const LoadingState = loadingState || ExploreLoadingState;
    const IdleState = idleState || ExploreIdleState;
    const EmptyState = emptyState || ExploreEmptyQueryState;

    if (status === 'loading') {
        return <LoadingState />;
    }

    return (
        <TableProvider {...rest} containerWidth={containerRect.width}>
            <TableContent
                containerRef={containerRef}
                className={className}
                $shouldExpand={$shouldExpand}
                $padding={$padding}
                dataTestId={dataTestId}
                status={status}
                minimal={minimal}
                showSubtotals={showSubtotals}
                isDashboard={isDashboard}
                errorDetail={errorDetail}
                EmptyState={EmptyState}
                IdleState={IdleState}
            />
        </TableProvider>
    );
};

export default Table;
