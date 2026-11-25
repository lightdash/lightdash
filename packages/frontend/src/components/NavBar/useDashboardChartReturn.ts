import { assertUnreachable } from '@lightdash/common';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import useDashboardStorage from '../../hooks/dashboard/useDashboardStorage';
import { useOptionalProjectRoute } from '../../hooks/useProjectRoute';

export type DashboardChartAction = 'creating' | 'editing' | 'viewing';

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

    const cancelButtonText = useMemo(() => {
        switch (action) {
            case 'viewing':
                return 'Return to dashboard';
            case 'creating':
            case 'editing':
                return 'Cancel';
            default:
                return assertUnreachable(
                    action,
                    `${action} is not a valid action`,
                );
        }
    }, [action]);

    const cancelButtonTooltipText = useMemo(() => {
        switch (action) {
            case 'creating':
                return 'Cancel chart creation and return to dashboard';
            case 'editing':
                return 'Cancel chart editing and return to dashboard';
            case 'viewing':
                return '';
            default:
                return assertUnreachable(
                    action,
                    `${action} is not a valid action`,
                );
        }
    }, [action]);

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
        cancelButtonText,
        cancelButtonTooltipText,
        handleOnCancel,
    };
};
