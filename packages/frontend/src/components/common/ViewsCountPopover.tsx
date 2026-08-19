import { type DetailedViewStatistics } from '@lightdash/common';
import { Box, HoverCard, Loader, Stack, Text } from '@mantine/core';
import { type FC, type ReactNode, useState } from 'react';
import { useChartViewStats } from '../../hooks/chart/useChartViewStats';
import { useDashboardViewStats } from '../../hooks/dashboard/useDashboardViewStats';

type ViewsCountPopoverProps = {
    children: ReactNode;
    resourceType: 'chart' | 'dashboard' | undefined;
    resourceUuid: string;
    projectUuid: string | undefined;
    viewStats?: DetailedViewStatistics;
};

const ViewsCountPopover: FC<ViewsCountPopoverProps> = ({
    children,
    resourceType,
    resourceUuid,
    projectUuid,
    viewStats,
}) => {
    const [opened, setOpened] = useState(false);
    const chartViewStats = useChartViewStats(
        resourceType === 'chart' ? resourceUuid : undefined,
        { enabled: opened && resourceType === 'chart' && !viewStats },
    );
    const dashboardViewStats = useDashboardViewStats(
        resourceType === 'dashboard' ? resourceUuid : undefined,
        projectUuid,
        { enabled: opened && resourceType === 'dashboard' && !viewStats },
    );
    const stats =
        viewStats ?? chartViewStats.data ?? dashboardViewStats.data ?? null;
    const isLoading = chartViewStats.isLoading || dashboardViewStats.isLoading;

    if (!resourceType) return children;

    return (
        <HoverCard
            position="bottom-start"
            openDelay={200}
            closeDelay={100}
            onOpen={() => setOpened(true)}
            onClose={() => setOpened(false)}
            withArrow
            withinPortal
        >
            <HoverCard.Target>
                <Box component="span">{children}</Box>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                {isLoading && !stats ? (
                    <Loader size="xs" />
                ) : (
                    <Stack gap={2}>
                        <Text fz="sm" fw={600}>
                            {(stats?.uniqueViewerCount ?? 0).toLocaleString()}{' '}
                            unique{' '}
                            {stats?.uniqueViewerCount === 1
                                ? 'viewer'
                                : 'viewers'}
                        </Text>
                        {(stats?.anonymousViewCount ?? 0) > 0 && (
                            <Text fz="xs" c="dimmed">
                                Plus{' '}
                                {stats?.anonymousViewCount.toLocaleString()}{' '}
                                anonymous{' '}
                                {stats?.anonymousViewCount === 1
                                    ? 'view'
                                    : 'views'}
                            </Text>
                        )}
                    </Stack>
                )}
            </HoverCard.Dropdown>
        </HoverCard>
    );
};

export default ViewsCountPopover;
