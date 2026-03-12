import {
    Button,
    Card,
    Group,
    LoadingOverlay,
    SimpleGrid,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { IconRefresh } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import { useProjectQueryHistory } from '../../hooks/useProjectQueryHistory';
import MantineIcon from '../common/MantineIcon';
import { formatDuration } from '../PreAggregateMaterializations/formatters';
import QueryHistoryTable from './QueryHistoryTable';

type QueryHistoryProps = {
    projectUuid: string;
};

const FETCH_SIZE = 10;

const formatAverageDuration = (value: number | null): string =>
    value == null ? 'No data' : formatDuration(Math.round(value));

const QueryHistory: FC<QueryHistoryProps> = ({ projectUuid }) => {
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();
    const { isLoading: isLoadingProject } = useProject(projectUuid);
    const { data, isLoading, isError, fetchNextPage, isFetching } =
        useProjectQueryHistory({
            projectUuid,
            paginateArgs: { page: 1, pageSize: FETCH_SIZE },
        });

    const queryHistory = useMemo(
        () => data?.pages.flatMap((page) => page.data.queryHistory) ?? [],
        [data],
    );

    const summary = data?.pages[0]?.data.summary;
    const totalQueries = data?.pages[0]?.pagination?.totalResults ?? 0;

    const handleRefresh = async () => {
        await queryClient.invalidateQueries([
            'projectQueryHistory',
            projectUuid,
        ]);
        showToastSuccess({
            title: 'Query history refreshed',
        });
    };

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />

            <Stack gap="md">
                <Group justify="space-between">
                    <Stack gap={2}>
                        <Title order={5}>Query History</Title>
                        <Text c="dimmed" size="xs">
                            Monitor recent warehouse queries for this project.
                            The newest 10 rows load first and older rows stream
                            in as you scroll.
                        </Text>
                    </Stack>

                    <Button
                        onClick={handleRefresh}
                        variant="default"
                        size="xs"
                        leftSection={<MantineIcon icon={IconRefresh} />}
                    >
                        Refresh history
                    </Button>
                </Group>

                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                    <Card withBorder p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                            Queue Length
                        </Text>
                        <Text size="xl" fw={700}>
                            {summary?.queueLength ?? 0}
                        </Text>
                    </Card>
                    <Card withBorder p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                            Processing
                        </Text>
                        <Text size="xl" fw={700}>
                            {summary?.processingCount ?? 0}
                        </Text>
                    </Card>
                    <Card withBorder p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                            Avg Queue Time
                        </Text>
                        <Text size="xl" fw={700}>
                            {formatAverageDuration(
                                summary?.avgQueueTimeMs ?? null,
                            )}
                        </Text>
                    </Card>
                    <Card withBorder p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                            Avg Execution Time
                        </Text>
                        <Text size="xl" fw={700}>
                            {formatAverageDuration(
                                summary?.avgExecutionTimeMs ?? null,
                            )}
                        </Text>
                    </Card>
                </SimpleGrid>

                <QueryHistoryTable
                    queryHistory={queryHistory}
                    isLoading={isLoading}
                    isFetching={isFetching}
                    isError={isError}
                    fetchNextPage={fetchNextPage}
                    totalRowCount={totalQueries}
                />
            </Stack>
        </>
    );
};

export default QueryHistory;
