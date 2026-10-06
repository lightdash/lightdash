import { Button, Paper, Stack, Text, Title } from '@mantine/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { type FC } from 'react';
import Callout from '../../components/common/Callout';
import { RelativeTime } from './AiIdentityEventDisplay';
import { aiIdentityApi } from './api';
import { actionLabel, actorLabel } from './eventLabels';

export const AiIdentityExclusionChanges: FC<{ accountUuid: string }> = ({
    accountUuid,
}) => {
    const query = useInfiniteQuery({
        queryKey: ['ai-identity-exclusion-changes', accountUuid],
        queryFn: ({ pageParam = 1 }) =>
            aiIdentityApi.requestLog(pageParam, false, accountUuid),
        getNextPageParam: (page) =>
            page.pagination.page < page.pagination.totalPageCount
                ? page.pagination.page + 1
                : undefined,
    });
    const events = query.data?.pages.flatMap((page) => page.data) ?? [];
    return (
        <Paper p="md">
            <Stack gap="sm">
                <Title order={5}>Changes to exclusions</Title>
                {query.isLoading && <Text size="sm">Loading changes…</Text>}
                {query.isError && (
                    <Callout variant="danger">
                        Could not load changes.{' '}
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => void query.refetch()}
                        >
                            Retry
                        </Button>
                    </Callout>
                )}
                {!query.isLoading && !query.isError && events.length === 0 && (
                    <Text size="sm" c="dimmed">
                        No changes to exclusions yet.
                    </Text>
                )}
                {events.map((event) => (
                    <Stack key={event.aiIdentityEventUuid} gap={2}>
                        <Text size="sm">
                            {actorLabel(event)} · {actionLabel(event.action)}
                        </Text>
                        <Text size="sm">{event.detail}</Text>
                        <RelativeTime value={event.createdAt} />
                    </Stack>
                ))}
                {query.hasNextPage && (
                    <Button
                        variant="default"
                        loading={query.isFetchingNextPage}
                        onClick={() => void query.fetchNextPage()}
                    >
                        Load more
                    </Button>
                )}
            </Stack>
        </Paper>
    );
};
