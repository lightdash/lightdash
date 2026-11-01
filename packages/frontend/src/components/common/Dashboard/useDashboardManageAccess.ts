import { subject } from '@casl/ability';
import { canMutateVerifiedContent, type Dashboard } from '@lightdash/common';
import useApp from '../../../providers/App/useApp';

// False while the dashboard is not loaded yet
export const useDashboardManageAccess = (dashboard: Dashboard | undefined) => {
    const { user } = useApp();
    const hasDashboardManageAbility =
        !!dashboard &&
        !!user.data?.ability.can('manage', subject('Dashboard', dashboard));
    const userCanManageDashboard =
        !!dashboard &&
        !!user.data &&
        hasDashboardManageAbility &&
        canMutateVerifiedContent(
            user.data.ability,
            {
                organizationUuid: dashboard.organizationUuid,
                projectUuid: dashboard.projectUuid,
            },
            dashboard.verification,
            user.data.userUuid,
        );
    return { hasDashboardManageAbility, userCanManageDashboard };
};
