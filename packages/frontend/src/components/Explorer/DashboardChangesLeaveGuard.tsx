import { Button, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useBlocker } from 'react-router';
import { isDroppingDashboardChanges } from '../../hooks/dashboard/dashboardChartPlace';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useIsLeftNavigationShown } from '../AppSidebar/useIsLeftNavigationShown';
import MantineModal from '../common/MantineModal';

/**
 * Asks before a chart being created for a dashboard is abandoned for another
 * page, since the dashboard's unsaved edits are dropped with it.
 */
export const DashboardChangesLeaveGuard: FC = () => {
    const { getIsEditingDashboardChart, getHasDashboardChanges } =
        useDashboardStorage();
    const isLeftNavigationShown = useIsLeftNavigationShown();

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isLeftNavigationShown &&
            isDroppingDashboardChanges({
                currentPathname: currentLocation.pathname,
                nextPathname: nextLocation.pathname,
                isEditingDashboardChart: getIsEditingDashboardChart(),
                hasDashboardChanges: getHasDashboardChanges(),
                isNextTheSameSavedChart: false,
            }),
    );

    if (blocker.state !== 'blocked') return null;

    return (
        <MantineModal
            opened
            onClose={() => blocker.reset()}
            role="alertdialog"
            title="Unsaved changes"
            icon={IconAlertCircle}
            cancelLabel="Stay"
            actions={
                <Button color="red" onClick={() => blocker.proceed()}>
                    Leave
                </Button>
            }
        >
            <Text fw={500}>
                You have unsaved changes to your dashboard! Are you sure you
                want to leave without saving?
            </Text>
        </MantineModal>
    );
};
