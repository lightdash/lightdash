import { type FC } from 'react';
import { useBlocker } from 'react-router';
import { useIsDroppingDashboardChanges } from '../../hooks/dashboard/useIsDroppingDashboardChanges';
import { UnsavedChangesLeaveModal } from './UnsavedChangesLeaveModal';

/**
 * Asks before a chart being created for a dashboard is abandoned for another
 * page, since the dashboard's unsaved edits are dropped with it.
 */
export const DashboardChangesLeaveGuard: FC = () => {
    const isDroppingDashboardChanges = useIsDroppingDashboardChanges();

    const blocker = useBlocker(({ currentLocation, nextLocation }) =>
        isDroppingDashboardChanges({
            currentPathname: currentLocation.pathname,
            nextPathname: nextLocation.pathname,
            isNextTheSameSavedChart: false,
        }),
    );

    if (blocker.state !== 'blocked') return null;

    return (
        <UnsavedChangesLeaveModal
            unsaved="dashboard"
            onStay={() => blocker.reset()}
            onLeave={() => blocker.proceed()}
        />
    );
};
