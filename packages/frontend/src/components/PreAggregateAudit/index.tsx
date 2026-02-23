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
import { useEffect, useMemo, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { usePreAggregateStats } from '../../hooks/usePreAggregateStats';
import { useProject } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import PreAggregateStatsTable from './PreAggregateStatsTable';

type PreAggregateAuditProps = {
    projectUuid: string;
};

const PreAggregateAudit: FC<PreAggregateAuditProps> = ({ projectUuid }) => {
    const queryClient = useQueryClient();
    const { showToastSuccess } = useToaster();
    const { isLoading: isLoadingProject } = useProject(projectUuid);
    const {
        data,
        isLoading,
        isError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = usePreAggregateStats(projectUuid, 3);

    // Eagerly load all pages
    useEffect(() => {
        if (hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const stats = useMemo(
        () => data?.pages.flatMap((page) => page.data.stats) ?? [],
        [data],
    );

    const summary = useMemo(() => {
        let totalHits = 0;
        let totalMisses = 0;
        const explores = new Set<string>();

        for (const stat of stats) {
            totalHits += stat.hitCount;
            totalMisses += stat.missCount;
            explores.add(stat.exploreName);
        }

        const totalQueries = totalHits + totalMisses;
        const hitRate =
            totalQueries > 0 ? Math.round((totalHits / totalQueries) * 100) : 0;

        return {
            hitRate,
            totalQueries,
            exploreCount: explores.size,
        };
    }, [stats]);

    const handleRefresh = async () => {
        await queryClient.invalidateQueries(['preAggregateStats', projectUuid]);
        showToastSuccess({
            title: 'Pre-aggregate stats refreshed',
        });
    };

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />

            <Stack gap="md">
                <Group justify="space-between">
                    <Stack gap={2}>
                        <Title order={5}>Pre-Aggregate Audit</Title>
                        <Text c="dimmed" size="xs">
                            Track how often your pre-aggregates are being used.
                            Data is retained for 3 days.
                        </Text>
                    </Stack>

                    <Button
                        onClick={handleRefresh}
                        variant="default"
                        size="xs"
                        leftSection={<MantineIcon icon={IconRefresh} />}
                    >
                        Refresh stats
                    </Button>
                </Group>

                <SimpleGrid cols={3}>
                    <Card withBorder p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                            Hit Rate (3 days)
                        </Text>
                        <Text size="xl" fw={700}>
                            {summary.totalQueries > 0
                                ? `${summary.hitRate}%`
                                : 'No data'}
                        </Text>
                    </Card>
                    <Card withBorder p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                            Total Queries
                        </Text>
                        <Text size="xl" fw={700}>
                            {summary.totalQueries}
                        </Text>
                    </Card>
                    <Card withBorder p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                            Explores with Pre-Aggregates
                        </Text>
                        <Text size="xl" fw={700}>
                            {summary.exploreCount}
                        </Text>
                    </Card>
                </SimpleGrid>

                <PreAggregateStatsTable
                    stats={stats}
                    isLoading={isLoading}
                    isError={isError}
                    projectUuid={projectUuid}
                />
            </Stack>
        </>
    );
};

export default PreAggregateAudit;
