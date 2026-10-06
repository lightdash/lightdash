import {
    Button,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { type FC } from 'react';
import Callout from '../../components/common/Callout';
import { aiIdentityApi } from './api';
import { exclusionChangeRows } from './exclusionChanges';

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
    const rows = exclusionChangeRows(
        query.data?.pages.flatMap((page) => page.data) ?? [],
    );
    return (
        <Paper p={18} withBorder radius="md">
            <Stack gap="sm">
                <Title order={5}>Change log</Title>
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
                {!query.isLoading && !query.isError && rows.length === 0 && (
                    <Text size="sm" c="dimmed">
                        No changes to exclusions yet.
                    </Text>
                )}
                <Stack gap={0}>
                    {rows.map(({ id, createdAt, sentence }) => (
                        <Group
                            key={id}
                            wrap="nowrap"
                            align="flex-start"
                            gap="xl"
                            py={6}
                            style={{
                                borderBottom:
                                    '1px solid var(--mantine-color-gray-2)',
                            }}
                        >
                            <Tooltip
                                label={new Date(createdAt).toLocaleString()}
                            >
                                <Text
                                    component="time"
                                    dateTime={new Date(createdAt).toISOString()}
                                    size="sm"
                                    w={48}
                                    style={{ flexShrink: 0 }}
                                >
                                    {new Date(createdAt).toLocaleTimeString(
                                        'en-GB',
                                        {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: false,
                                        },
                                    )}
                                </Text>
                            </Tooltip>
                            <Text size="sm">{sentence}</Text>
                        </Group>
                    ))}
                </Stack>
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
