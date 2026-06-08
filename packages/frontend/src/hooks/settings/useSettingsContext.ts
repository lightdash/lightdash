import { CommercialFeatureFlags, FeatureFlags } from '@lightdash/common';
import { useIsGitProject } from '../../components/Explorer/WriteBackModal/hooks';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import useApp from '../../providers/App/useApp';
import { useOrganization } from '../organization/useOrganization';
import { useActiveProjectUuid } from '../useActiveProject';
import { useProject } from '../useProject';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';
import { type SettingsContext } from './types';

/**
 * Single source for the settings page's runtime gating inputs: the current
 * user + abilities, health/organization/project, whether the active project is
 * git-connected, and the resolved feature flags — plus the loading/error state
 * of the underlying queries. The router, the sidebar nav (`useSettingsNavigation`),
 * and a future global settings search all derive what to show from this context.
 */
export const useSettingsContext = (): SettingsContext => {
    const { data: embeddingEnabled } = useServerFeatureFlag(
        CommercialFeatureFlags.Embedding,
    );

    const { data: isScimTokenManagementEnabled } = useServerFeatureFlag(
        CommercialFeatureFlags.Scim,
    );

    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const isAiCopilotEnabledOrTrial =
        aiOrganizationSettingsQuery.isSuccess &&
        (aiOrganizationSettingsQuery.data.isCopilotEnabled ||
            aiOrganizationSettingsQuery.data.isTrial);

    const { data: aiAgentReviewClassifierFlag } = useServerFeatureFlag(
        FeatureFlags.AiAgentReviewClassifier,
    );
    const isAiAgentReviewClassifierEnabled =
        aiAgentReviewClassifierFlag?.enabled === true;
    const shouldShowAiAgentReviews =
        isAiAgentReviewClassifierEnabled &&
        aiOrganizationSettingsQuery.data?.aiAgentReviewsEnabled === true;

    const { data: serviceAccountsFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.ServiceAccounts,
    );
    const isServiceAccountFeatureFlagEnabled =
        serviceAccountsFlag?.enabled ?? false;

    const {
        health: {
            data: health,
            isInitialLoading: isHealthLoading,
            error: healthError,
        },
        user: { data: user, isInitialLoading: isUserLoading, error: userError },
    } = useApp();

    const { data: isUserImpersonationEnabled } = useServerFeatureFlag(
        FeatureFlags.UserImpersonation,
    );

    const showImpersonationPanel =
        isUserImpersonationEnabled?.enabled &&
        user?.ability?.can('update', 'Organization');

    const { data: leaveOrganizationFlag } = useServerFeatureFlag(
        FeatureFlags.LeaveOrganization,
    );
    const isLeaveOrganizationEnabled = leaveOrganizationFlag?.enabled === true;

    const { data: customRolesFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.CustomRoles,
    );
    const isCustomRolesEnabled =
        health?.isCustomRolesEnabled || customRolesFlag?.enabled;

    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const { data: dataAppsFlag } = useServerFeatureFlag(
        FeatureFlags.EnableDataApps,
    );

    const { data: proLimitsFlag } = useServerFeatureFlag(
        FeatureFlags.ProLimits,
    );
    const isProLimitsEnabled = proLimitsFlag?.enabled ?? false;

    const { data: ssoOrganizationSettingsFlag } = useServerFeatureFlag(
        FeatureFlags.SsoOrganizationSettings,
    );
    const isSsoOrganizationSettingsEnabled =
        ssoOrganizationSettingsFlag?.enabled ?? false;

    const {
        data: organization,
        isInitialLoading: isOrganizationLoading,
        error: organizationError,
    } = useOrganization();
    const { activeProjectUuid, isLoading: isActiveProjectUuidLoading } =
        useActiveProjectUuid();
    const {
        data: project,
        isInitialLoading: isProjectLoading,
        error: projectError,
    } = useProject(activeProjectUuid);

    const isGitProject = useIsGitProject(activeProjectUuid ?? '');

    const allowPasswordAuthentication =
        !health?.auth.disablePasswordAuthentication;

    const hasSocialLogin =
        health?.auth.google.enabled ||
        health?.auth.okta.enabled ||
        health?.auth.oneLogin.enabled ||
        health?.auth.azuread.enabled ||
        health?.auth.oidc.enabled;

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.data?.enabled ?? false;

    // This allows us to enable service accounts in the UI for on-premise installations
    const isServiceAccountsEnabled =
        health?.isServiceAccountEnabled || isServiceAccountFeatureFlagEnabled;

    const { data: warehouseCredentialsFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.OrganizationWarehouseCredentials,
    );
    const isWarehouseCredentialsFeatureFlagEnabled =
        warehouseCredentialsFlag?.enabled ?? false;

    // This allows us to enable organization warehouse credentials in the UI for on-premise installations
    const isWarehouseCredentialsEnabled =
        (health?.isOrganizationWarehouseCredentialsEnabled ?? false) ||
        isWarehouseCredentialsFeatureFlagEnabled;

    return {
        user,
        health,
        organization,
        project,
        showImpersonationPanel,
        isLeaveOrganizationEnabled,
        isCustomRolesEnabled,
        isProLimitsEnabled,
        isSsoOrganizationSettingsEnabled,
        isScimTokenManagementEnabled,
        isServiceAccountsEnabled,
        isAiCopilotEnabledOrTrial,
        shouldShowAiAgentReviews,
        dataAppsFlag,
        embeddingEnabled,
        allowPasswordAuthentication,
        hasSocialLogin,
        isGroupManagementEnabled,
        isWarehouseCredentialsEnabled,
        isGitProject,
        isHealthLoading,
        healthError,
        isUserLoading,
        userError,
        isOrganizationLoading,
        organizationError,
        isActiveProjectUuidLoading,
        isProjectLoading,
        projectError,
    };
};
