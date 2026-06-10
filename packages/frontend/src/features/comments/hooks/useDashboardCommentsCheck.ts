import { type UserWithAbility } from '../../../hooks/user/useUser';
import useApp from '../../../providers/App/useApp';

export const useDashboardCommentsCheck = (
    user: UserWithAbility | undefined,
) => {
    const { health } = useApp();

    const canViewDashboardComments = !!user?.ability?.can(
        'view',
        'DashboardComments',
    );

    const canCreateDashboardComments = !!user?.ability?.can(
        'create',
        'DashboardComments',
    );

    const canManageDashboardComments = !!user?.ability?.can(
        'manage',
        'DashboardComments',
    );

    // Default-on; opt out via DISABLE_DASHBOARD_COMMENTS=true on the backend.
    const isDashboardCommentsEnabled =
        health.data?.dashboardComments?.enabled ?? true;

    return {
        canViewDashboardComments:
            isDashboardCommentsEnabled && canViewDashboardComments,
        canCreateDashboardComments:
            isDashboardCommentsEnabled && canCreateDashboardComments,
        canManageDashboardComments:
            isDashboardCommentsEnabled && canManageDashboardComments,
    };
};
