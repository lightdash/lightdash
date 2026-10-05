import {
    Button,
    Group,
    Paper,
    Stack,
    Switch,
    Table,
    Text,
} from '@mantine/core';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import Callout from '../../components/common/Callout';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import { EventStatus, RelativeTime } from './AiIdentityEventDisplay';
import { aiIdentityApi } from './api';
import { actionLabel, actorLabel } from './eventLabels';

export const AiIdentityRequestLog: FC = () => {
    const [showReads, setShowReads] = useState(false);
    const query = useInfiniteQuery({
        queryKey: ['ai-identity-request-log', showReads],
        queryFn: ({ pageParam = 1 }) =>
            aiIdentityApi.requestLog(pageParam, showReads),
        getNextPageParam: (page) =>
            page.pagination.page < page.pagination.totalPageCount
                ? page.pagination.page + 1
                : undefined,
    });
    const events = query.data?.pages.flatMap((page) => page.data) ?? [];

    return (
        <Stack gap="sm">
            <Switch
                label="Show reads"
                checked={showReads}
                onChange={(event) => setShowReads(event.currentTarget.checked)}
            />
            {query.isError && (
                <Callout variant="danger">
                    Could not load the request log.{' '}
                    <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => void query.refetch()}
                    >
                        Retry
                    </Button>
                </Callout>
            )}
            {query.isLoading && <EmptyStateLoader />}
            <Paper>
                <Table.ScrollContainer minWidth={850}>
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Time</Table.Th>
                                <Table.Th>Action</Table.Th>
                                <Table.Th>Actor</Table.Th>
                                <Table.Th>People</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Detail</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {events.map((event) => (
                                <Table.Tr key={event.aiIdentityEventUuid}>
                                    <Table.Td>
                                        <RelativeTime value={event.createdAt} />
                                    </Table.Td>
                                    <Table.Td>
                                        {actionLabel(event.action)}
                                    </Table.Td>
                                    <Table.Td>{actorLabel(event)}</Table.Td>
                                    <Table.Td>{event.targetCount}</Table.Td>
                                    <Table.Td>
                                        <EventStatus event={event} />
                                    </Table.Td>
                                    <Table.Td>
                                        <Text fz="sm" lineClamp={2}>
                                            {event.detail ?? '—'}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Paper>
            {!query.isLoading && events.length === 0 && !query.isError && (
                <Text c="dimmed" fz="sm">
                    No provisioning requests or checks yet.
                </Text>
            )}
            {query.hasNextPage && (
                <Group justify="center">
                    <Button
                        variant="default"
                        loading={query.isFetchingNextPage}
                        onClick={() => void query.fetchNextPage()}
                    >
                        Load more
                    </Button>
                </Group>
            )}
        </Stack>
    );
};
