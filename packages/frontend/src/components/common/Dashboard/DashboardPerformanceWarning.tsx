import { type Dashboard } from '@lightdash/common';
import { ActionIcon, Box, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import useDashboardPerformanceWarning from '../../../hooks/dashboard/useDashboardPerformanceWarning';
import MantineIcon from '../MantineIcon';

type Props = {
    dashboardTiles?: Dashboard['tiles'];
    dashboardTabs?: Dashboard['tabs'];
};

export const DashboardPerformanceWarning: FC<Props> = ({
    dashboardTiles,
    dashboardTabs,
}) => {
    const performanceWarning = useDashboardPerformanceWarning(
        dashboardTiles,
        dashboardTabs,
    );
    if (!performanceWarning.hasWarning) return null;
    return (
        <Tooltip
            label={
                <Box>
                    <Text size="sm" fw={500} mb={6}>
                        Speed up this dashboard
                    </Text>
                    <Text size="xs">
                        With {performanceWarning.totalChartCount} charts, load
                        times can be slower depending on the user's machine.{' '}
                        {performanceWarning.totalTabs <= 1
                            ? `We recommend splitting this into multiple dashboard tabs, limited to ${performanceWarning.tabsExceedingLimit[0]?.limit ?? 10} charts per tab to keep things snappy for your team.`
                            : `We recommend splitting this into multiple dashboards to keep things snappy for your team.`}
                    </Text>
                </Box>
            }
            withinPortal
            position="bottom"
            multiline
            maw={320}
            openDelay={200}
            transitionProps={{
                transition: 'fade',
                duration: 150,
            }}
        >
            <ActionIcon size="md" color="orange.6">
                <MantineIcon icon={IconAlertTriangle} />
            </ActionIcon>
        </Tooltip>
    );
};
