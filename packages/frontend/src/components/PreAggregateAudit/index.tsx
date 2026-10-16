import { Button, Card, LoadingOverlay, SimpleGrid, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useToaster from '../../hooks/toaster/useToaster';
import { usePreAggregateStats } from '../../hooks/usePreAggregateStats';
import { useProject } from '../../hooks/useProject';
import MantineIcon from '../common/MantineIcon';
import { SettingsPage } from '../common/Settings/SettingsPage';
import PreAggregateStatsTable from './PreAggregateStatsTable';

type PreAggregateAuditProps = {
    projectUuid: string;
};

const PreAggregateAudit: FC<PreAggregateAuditProps> = ({ projectUuid }) => {
    const { t } = useTranslation('app');
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
            title: t('preAggregateAudit.refreshed'),
        });
    };

    return (
        <>
            <LoadingOverlay visible={isLoadingProject} />

            <SettingsPage
                title={t('preAggregateAudit.title')}
                description={t('preAggregateAudit.description')}
                actions={
                    <Button
                        onClick={handleRefresh}
                        variant="default"
                        size="xs"
                        leftSection={<MantineIcon icon={IconRefresh} />}
                    >
                        {t('preAggregateAudit.refreshStats')}
                    </Button>
                }
            >
                <SimpleGrid cols={3}>
                    <Card p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                            {t('preAggregateAudit.cacheRate')}
                        </Text>
                        <Text size="xl" fw={600}>
                            {summary.totalQueries > 0
                                ? `${summary.hitRate}%`
                                : t('preAggregateAudit.noData')}
                        </Text>
                    </Card>
                    <Card p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                            {t('preAggregateAudit.totalQueries')}
                        </Text>
                        <Text size="xl" fw={600}>
                            {summary.totalQueries}
                        </Text>
                    </Card>
                    <Card p="md">
                        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                            {t('preAggregateAudit.exploresWithPreAggregates')}
                        </Text>
                        <Text size="xl" fw={600}>
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
            </SettingsPage>
        </>
    );
};

export default PreAggregateAudit;
