import { subject } from '@casl/ability';
import { canMutateVerifiedContent } from '@lightdash/common';
import useApp from '../../providers/App/useApp';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useContentAuthoringEnabled } from '../useContentAuthoringEnabled';

/** Whether the current user may change the dashboard open in context. */
export const useCanManageDashboard = (): boolean => {
    const { user } = useApp();
    const dashboard = useDashboardContext((c) => c.dashboard);
    const authoringEnabled = useContentAuthoringEnabled();

    if (!authoringEnabled || !user.data || !dashboard) return false;

    return (
        user.data.ability.can('manage', subject('Dashboard', dashboard)) &&
        canMutateVerifiedContent(
            user.data.ability,
            {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            },
            dashboard.verification,
            user.data.userUuid,
        )
    );
};
