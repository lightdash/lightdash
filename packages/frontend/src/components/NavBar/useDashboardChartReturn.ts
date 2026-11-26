import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';

export type DashboardChartAction = 'creating' | 'editing' | 'viewing';

const CANCEL_COPY: Record<
    DashboardChartAction,
    { buttonText: string; tooltipText: string }
> = {
    creating: {
        buttonText: 'Cancel',
        tooltipText: 'Cancel chart creation and return to dashboard',
    },
    editing: {
        buttonText: 'Cancel',
        tooltipText: 'Cancel chart editing and return to dashboard',
    },
    // The button copy says enough on its own.
    viewing: { buttonText: 'Return to dashboard', tooltipText: '' },
};

export const useDashboardChartAction = (): DashboardChartAction => {
    const { savedQueryUuid, mode } = useParams<{
        savedQueryUuid: string;
        mode?: 'edit' | 'view';
    }>();
    if (!savedQueryUuid) {
        return 'creating';
    }
    return mode === 'edit' ? 'editing' : 'viewing';
};

/**
 * What a chart opened from a dashboard tile says about where it came from,
 * and the way back there.
 */
export const useDashboardChartReturn = (projectUuid: string | undefined) => {
    const projectRoute = useOptionalProjectRoute();
    const projectUrlIdentifier =
        projectRoute?.projectUrlIdentifier ?? projectUuid;
    const navigate = useNavigate();
    const { savedQueryUuid } = useParams<{ savedQueryUuid: string }>();
    const action = useDashboardChartAction();
    const [isCancelling, setIsCancelling] = useState(false);

    const { getEditingDashboardInfo } = useDashboardStorage();
    const {
        name: dashboardName,
        dashboardUuid,
        dashboardSlug,
        activeTabUuid,
    } = getEditingDashboardInfo();

    const handleOnCancel = useCallback(() => {
        if (!projectUrlIdentifier) {
            return;
        }
        // Cancel the action and navigate back to the dashboard, restoring the existing state (in case there were some unsaved changes)
        // Similar to the behaviour from `SaveToDashboard`
        // so do not clear the storage here
        setIsCancelling(true);

        let returnUrl = `/projects/${projectUrlIdentifier}/dashboards/${dashboardSlug ?? dashboardUuid}/${
            savedQueryUuid ? 'view' : 'edit'
        }`;

        if (activeTabUuid) {
            returnUrl += `/tabs/${activeTabUuid}`;
        }

        void navigate(returnUrl);

        setTimeout(() => {
            // Clear the banner after navigating back to dashboard, but only after a delay so that the user can see the banner change
            setIsCancelling(false);
        }, 1000);
    }, [
        dashboardSlug,
        dashboardUuid,
        activeTabUuid,
        navigate,
        projectUrlIdentifier,
        savedQueryUuid,
    ]);

    return {
        action,
        dashboardName,
        isCancelling,
        cancelButtonText: CANCEL_COPY[action].buttonText,
        cancelButtonTooltipText: CANCEL_COPY[action].tooltipText,
        handleOnCancel,
    };
};
