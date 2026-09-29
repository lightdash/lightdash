import {
    Box,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useIntersection } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { Fragment, useEffect, type ReactNode } from 'react';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';

/** The paging state of a chart type listing. */
export type ChartTypeListQuery = {
    isInitialLoading: boolean;
    isFetching: boolean;
    error: unknown;
    refetch: () => unknown;
    hasNextPage?: boolean;
    fetchNextPage: () => unknown;
    isFetchingNextPage: boolean;
};

type Props<T extends { dataAppVizUuid: string }> = {
    query: ChartTypeListQuery;
    items: T[];
    search: string;
    onSearchChange: (search: string) => void;
    /** The search the listing was asked for; drives "no matches". */
    debouncedSearch: string;
    /** Nothing listed at all: the empty state carries its own action, so the
     *  search row is hidden. */
    isEmpty: boolean;
    /** Beside the search, such as "New chart type". */
    headerActions: ReactNode;
    emptyState: ReactNode;
    errorMessage: string;
    renderItem: (item: T) => ReactNode;
    paginationTestId: string;
};

/** A searchable, infinitely scrolled grid of chart types. */
const ChartTypeListSection = <T extends { dataAppVizUuid: string }>({
    query,
    items,
    search,
    onSearchChange,
    debouncedSearch,
    isEmpty,
    headerActions,
    emptyState,
    errorMessage,
    renderItem,
    paginationTestId,
}: Props<T>) => {
    const {
        isInitialLoading,
        isFetching,
        error,
        refetch,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = query;
    const { ref: paginationRef, entry: paginationEntry } = useIntersection({
        rootMargin: '200px',
    });

    useEffect(() => {
        if (
            paginationEntry?.isIntersecting &&
            hasNextPage &&
            !isFetching &&
            !error
        ) {
            void fetchNextPage();
        }
    }, [paginationEntry, hasNextPage, isFetching, error, fetchNextPage]);

    return (
        <Stack gap="md">
            {!isEmpty && (
                <Group justify="flex-end" gap="xs">
                    <TextInput
                        size="xs"
                        w={220}
                        placeholder="Search by name or description"
                        leftSection={
                            <MantineIcon icon={IconSearch} size={15} />
                        }
                        value={search}
                        onChange={(e) => onSearchChange(e.currentTarget.value)}
                    />
                    {headerActions}
                </Group>
            )}

            {isInitialLoading ? (
                <EmptyStateLoader title="Loading chart types…" />
            ) : error ? (
                <InlineErrorState
                    message={errorMessage}
                    onRetry={() => void refetch()}
                />
            ) : items.length === 0 ? (
                debouncedSearch ? (
                    <Paper variant="dotted" p="xl">
                        <Text ta="center" fz="xs" c="dimmed">
                            No chart types match &ldquo;
                            {debouncedSearch}&rdquo;
                        </Text>
                    </Paper>
                ) : (
                    emptyState
                )
            ) : (
                <>
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                        {items.map((item) => (
                            <Fragment key={item.dataAppVizUuid}>
                                {renderItem(item)}
                            </Fragment>
                        ))}
                    </SimpleGrid>
                    {hasNextPage && (
                        <Box
                            ref={paginationRef}
                            data-testid={paginationTestId}
                            mih="xl"
                            role="status"
                        >
                            {isFetchingNextPage && (
                                <EmptyStateLoader description="Loading more chart types…" />
                            )}
                        </Box>
                    )}
                </>
            )}
        </Stack>
    );
};

export default ChartTypeListSection;
