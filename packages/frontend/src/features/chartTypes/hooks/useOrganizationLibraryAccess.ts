import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { useOrganizationChartTypesSetting } from '../../../hooks/organization/useOrganizationChartTypesSetting';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import useApp from '../../../providers/App/useApp';

/**
 * Whether the current user builds, edits and deletes organization chart
 * types. It needs the rollout flag, data apps (the backend asserts them on
 * every write), the organization library setting and
 * `manage OrganizationChartType`. False while any of them loads.
 */
export const useOrganizationChartTypeManageAccess = () => {
    const ability = useAbilityContext();
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    const flag = useServerFeatureFlag(FeatureFlags.OrganizationChartTypes);
    const dataAppsFlag = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const isFlagEnabled = flag.data?.enabled === true;
    const canView =
        !!organizationUuid &&
        ability.can(
            'view',
            subject('OrganizationChartType', { organizationUuid }),
        );
    const readsSetting = isFlagEnabled && canView;
    const setting = useOrganizationChartTypesSetting({ enabled: readsSetting });
    const canManage =
        isFlagEnabled &&
        dataAppsFlag.data?.enabled === true &&
        setting.data?.enabled === true &&
        !!organizationUuid &&
        ability.can(
            'manage',
            subject('OrganizationChartType', { organizationUuid }),
        );
    return {
        canManage,
        isLoading:
            flag.isLoading ||
            dataAppsFlag.isLoading ||
            (readsSetting && setting.isInitialLoading),
    };
};

export const useCanManageOrganizationChartTypes = (): boolean =>
    useOrganizationChartTypeManageAccess().canManage;

/**
 * Whether the organization library is shown to the current user. It needs the
 * rollout flag, the organization setting and `view OrganizationChartType`.
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
    const setting = useOrganizationChartTypesSetting({
        enabled: isFlagEnabled && canView,
    });

    return {
        isVisible: isFlagEnabled && canView && setting.data?.enabled === true,
    };
};
