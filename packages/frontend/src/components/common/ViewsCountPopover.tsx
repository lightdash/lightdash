import { type DetailedViewStatistics, type ViewTrend } from '@lightdash/common';
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
import { type EChartsOption } from 'echarts';
import { type FC, type ReactNode, useMemo, useState } from 'react';
import { useChartViewStats } from '../../hooks/chart/useChartViewStats';
import { useDashboardViewStats } from '../../hooks/dashboard/useDashboardViewStats';
import EChartsReact from '../EChartsReactWrapper';
import classes from './ViewsCountPopover.module.css';

const LINE_COLOR = 'var(--mantine-color-violet-5)';

const formatBucket = (date: string, granularity: ViewTrend['granularity']) =>
    dayjs(date).format(granularity === 'hour' ? 'MMM D, h A' : 'MMM D');

const getWindowLabel = ({ granularity, points }: ViewTrend) =>
    granularity === 'hour'
        ? `Last ${points.length} hours`
        : `Last ${points.length} ${points.length === 1 ? 'day' : 'days'}`;

const ViewsSparkline: FC<{ data: ViewTrend['points'] }> = ({ data }) => {
    const option = useMemo<EChartsOption>(
        () => ({
            animation: false,
            grid: { left: 2, right: 2, top: 4, bottom: 4 },
            xAxis: {
                type: 'category',
                show: false,
                boundaryGap: false,
                data: data.map((point) => point.date),
            },
            yAxis: {
                type: 'value',
                show: false,
                min: 0,
                splitLine: { show: false },
            },
            series: [
                {
                    type: 'line',
                    data: data.map((point) => point.views),
                    smooth: true,
                    silent: true,
                    symbol: 'none',
                    lineStyle: { width: 2, color: LINE_COLOR },
                    areaStyle: { opacity: 0.08, color: LINE_COLOR },
                },
            ],
            tooltip: { show: false },
        }),
        [data],
    );

    return (
        <EChartsReact
            className={classes.sparkline}
            option={option}
            notMerge
            opts={{ renderer: 'svg' }}
            style={{ height: 42, width: '100%' }}
        />
    );
};

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
                <Skeleton height={14} width="60%" />
                <Skeleton height={42} radius="sm" />
                <Skeleton height={14} />
                <Skeleton height={14} />
            </Stack>
        );
    }

    const { points, granularity } = stats.viewTrend;
    const recentViews = points.reduce((total, point) => total + point.views, 0);
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    return (
        <Stack gap={6}>
            <Box>
                <Group justify="space-between" mb={4} wrap="nowrap">
                    <Text className={classes.heading}>
                        {getWindowLabel(stats.viewTrend)}
                    </Text>
                    <Text className={classes.heading}>
                        {recentViews.toLocaleString()}{' '}
                        {recentViews === 1 ? 'view' : 'views'}
                    </Text>
                </Group>
                <ViewsSparkline data={points} />
                {firstPoint && lastPoint && (
                    <Group justify="space-between" mt={2} wrap="nowrap">
                        <Text className={classes.axisLabel}>
                            {formatBucket(firstPoint.date, granularity)}
                        </Text>
                        <Text className={classes.axisLabel}>
                            {formatBucket(lastPoint.date, granularity)}
                        </Text>
                    </Group>
                )}
            </Box>

            <Stack gap={4} className={classes.section}>
                <Text className={classes.heading} mb={2}>
                    All time
                </Text>
                <StatRow label="Views">{stats.views.toLocaleString()}</StatRow>
                <StatRow label="Unique viewers">
                    {stats.uniqueViewerCount.toLocaleString()}
                </StatRow>
                {stats.firstViewedAt && (
                    <StatRow label="First viewed">
                        {dayjs(stats.firstViewedAt).format('MMM D, YYYY')}
                    </StatRow>
                )}
                {stats.anonymousViewCount > 0 && (
                    <Text className={classes.axisLabel}>
                        Includes {stats.anonymousViewCount.toLocaleString()}{' '}
                        {stats.anonymousViewCount === 1
                            ? 'anonymous view'
                            : 'anonymous views'}{' '}
                        not tied to a user
                    </Text>
                )}
            </Stack>
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
