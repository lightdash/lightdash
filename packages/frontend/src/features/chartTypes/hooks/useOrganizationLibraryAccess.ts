import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { useOrganizationChartTypesSetting } from '../../../hooks/organization/useOrganizationChartTypesSetting';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';

/** Whether the current user builds and deletes organization chart types. */
export const useCanManageOrganizationChartTypes = (): boolean => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    return (
        !!organizationUuid &&
        ability.can(
            'manage',
            subject('OrganizationChartType', { organizationUuid }),
        )
    );
};

/**
 * Whether the organization library is shown to the current user, and whether
 * they manage it. It needs the rollout flag, the organization setting and
 * `view OrganizationChartType`.
 */
export const useOrganizationLibraryAccess = () => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    const flag = useServerFeatureFlag(FeatureFlags.OrganizationChartTypes);
    const isFlagEnabled = flag.data?.enabled === true;
    const canView =
        !!organizationUuid &&
        ability.can(
            'view',
            subject('OrganizationChartType', { organizationUuid }),
        );
    const canManage = useCanManageOrganizationChartTypes();
    const setting = useOrganizationChartTypesSetting({
        enabled: isFlagEnabled && canView,
    });

    return {
        isVisible: isFlagEnabled && canView && setting.data?.enabled === true,
        canManage: isFlagEnabled && canManage,
    };
};
