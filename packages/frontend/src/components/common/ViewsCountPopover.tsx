import { type DetailedViewStatistics } from '@lightdash/common';
import {
    Box,
    Group,
    HoverCard,
    Skeleton,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import dayjs from 'dayjs';
import { type FC, type ReactNode, useState } from 'react';
import { useChartViewStats } from '../../hooks/chart/useChartViewStats';
import { useDashboardViewStats } from '../../hooks/dashboard/useDashboardViewStats';
import classes from './ViewsCountPopover.module.css';

const StatRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Group justify="space-between" wrap="nowrap" gap="md">
        <Text className={classes.rowLabel}>{label}</Text>
        <Text className={classes.rowValue}>{children}</Text>
    </Group>
);

const ViewStatsCard: FC<{ stats: DetailedViewStatistics | undefined }> = ({
    stats,
}) => {
    if (!stats) {
        return (
            <Stack gap="xs">
                <Skeleton height={14} />
                <Skeleton height={14} />
            </Stack>
        );
    }

    return (
        <Stack gap={4}>
            <StatRow label="Unique viewers">
                {stats.uniqueViewerCount.toLocaleString()}
            </StatRow>
            {stats.firstViewedAt && (
                <StatRow label="First viewed">
                    {dayjs(stats.firstViewedAt).format('MMM D, YYYY')}
                </StatRow>
            )}
            {stats.anonymousViewCount > 0 && (
                <Text className={classes.note}>
                    Includes {stats.anonymousViewCount.toLocaleString()}{' '}
                    {stats.anonymousViewCount === 1
                        ? 'anonymous view'
                        : 'anonymous views'}{' '}
                    not tied to a user
                </Text>
            )}
        </Stack>
    );
};

type ViewsCountPopoverProps = {
    children: ReactNode;
    resourceType: 'chart' | 'dashboard' | undefined;
    resourceUuid: string;
    projectUuid: string | undefined;
    views: number;
    /** Plain tooltip for resources without per-user view events (SQL charts, data apps) */
    fallbackTooltip?: string;
};

const ViewsCountPopover: FC<ViewsCountPopoverProps> = ({
    children,
    resourceType,
    resourceUuid,
    projectUuid,
    views,
    fallbackTooltip,
}) => {
    const [opened, setOpened] = useState(false);
    const hasDetailedStats = resourceType !== undefined && views > 0;
    const chartViewStats = useChartViewStats(
        resourceType === 'chart' ? resourceUuid : undefined,
        { enabled: opened && hasDetailedStats && resourceType === 'chart' },
    );
    const dashboardViewStats = useDashboardViewStats(
        resourceType === 'dashboard' ? resourceUuid : undefined,
        projectUuid,
        {
            enabled: opened && hasDetailedStats && resourceType === 'dashboard',
        },
    );

    if (!hasDetailedStats) {
        return (
            <Tooltip
                label={fallbackTooltip}
                disabled={!fallbackTooltip}
                position="top-start"
            >
                <Box component="span">{children}</Box>
            </Tooltip>
        );
    }

    return (
        <HoverCard
            width={260}
            position="bottom-start"
            offset={6}
            openDelay={200}
            closeDelay={100}
            withinPortal
            onOpen={() => setOpened(true)}
            onClose={() => setOpened(false)}
        >
            <HoverCard.Target>
                <Box component="span" className={classes.trigger}>
                    {children}
                </Box>
            </HoverCard.Target>
            <HoverCard.Dropdown p="sm">
                <ViewStatsCard
                    stats={chartViewStats.data ?? dashboardViewStats.data}
                />
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

export default ViewsCountPopover;
