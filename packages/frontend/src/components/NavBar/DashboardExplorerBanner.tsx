import { Button, Text, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { useDashboardChartReturn } from './useDashboardChartReturn';

type Props = {
    projectUuid: string | undefined;
};

export const DashboardExplorerBanner: FC<Props> = ({ projectUuid }) => {
    const {
        action,
        dashboardName,
        isCancelling,
        cancelButtonText,
        cancelButtonTooltipText,
        handleOnCancel,
    } = useDashboardChartReturn(projectUuid);

    return (
        <>
            <MantineIcon icon={IconInfoCircle} color="white" size="sm" />

            <Text c="white" fw={500} fz="xs" mx={4}>
                {isCancelling
                    ? `Cancelling...`
                    : `You are ${action} this chart from within ${
                          dashboardName ? `"${dashboardName}"` : 'a dashboard'
                      }`}
            </Text>

            <Tooltip
                // Hide tooltip when viewing the chart because the button copy is sufficient
                disabled={action === 'viewing'}
                label={cancelButtonTooltipText}
                position="bottom"
                maw={350}
            >
                <Button
                    onClick={handleOnCancel}
                    size="compact-xs"
                    ml="md"
                    variant="white"
                >
                    {cancelButtonText}
                </Button>
            </Tooltip>
        </>
    );
};
