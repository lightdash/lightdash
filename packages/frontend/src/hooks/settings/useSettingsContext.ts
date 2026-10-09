import { subject } from '@casl/ability';
import { CommercialFeatureFlags, FeatureFlags } from '@lightdash/common';
import { matchPath, useLocation } from 'react-router';
import { useIsGitProject } from '../../components/Explorer/WriteBackModal/hooks';
import { shouldShowMyAgentConnections } from '../../components/UserSettings/MyAgentConnectionsPanel/visibility';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { useAiCreditUsage } from '../../ee/features/aiCredits/hooks/useAiCreditUsage';
import { useContentReviewAvailability } from '../../ee/features/contentReview/hooks/useContentReviewAvailability';
import { useOrganizationAgentIdentitySettings } from '../../features/aiAccess/api';
import useApp from '../../providers/App/useApp';
import { useOrganization } from '../organization/useOrganization';
import { useActiveProjectUuid } from '../useActiveProject';
import { useProject } from '../useProject';
import { useProjects } from '../useProjects';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';
import { type SettingsContext } from './types';
import { useProjectSettingsAccess } from './useProjectSettingsAccess';

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

    const {
        data: agentIdentityFlag,
        isInitialLoading: isAgentIdentityFlagLoading,
    } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const agentIdentitySettings = useOrganizationAgentIdentitySettings();
    const showMyAgentConnections = shouldShowMyAgentConnections(
        agentIdentityFlag?.enabled === true,
        agentIdentitySettings.data?.rules ?? [],
    );
    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const isAiCopilotEnabledOrTrial =
        aiOrganizationSettingsQuery.isSuccess &&
        (aiOrganizationSettingsQuery.data.isCopilotEnabled ||
            aiOrganizationSettingsQuery.data.isTrial);

    const shouldShowAiAgentReviews =
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

    const { data: customRolesFlag } = useServerFeatureFlag(
        CommercialFeatureFlags.CustomRoles,
    );
    const isCustomRolesEnabled =
        health?.isCustomRolesEnabled || customRolesFlag?.enabled;

    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    const dataAppsFlagQuery = useServerFeatureFlag(FeatureFlags.EnableDataApps);
    const { data: dataAppsFlag } = dataAppsFlagQuery;
    const dataAppAnalysisFlagQuery = useServerFeatureFlag(
        FeatureFlags.EnableDataAppAnalysis,
    );
    const { data: dataAppAnalysisFlag } = dataAppAnalysisFlagQuery;
    // Data apps > General holds a single setting (automatic thumbnails), so its
    // sidebar entry follows that flag. Drop this once another setting lands
    // there; the route itself is not gated.
    const dataAppAutomaticThumbnailsFlagQuery = useServerFeatureFlag(
        FeatureFlags.EnableDataAppAutomaticThumbnails,
    );
    const isDataAppGeneralSettingsEnabled =
        dataAppAutomaticThumbnailsFlagQuery.data?.enabled ?? false;

    const { data: externalSourcesFlag } = useServerFeatureFlag(
        FeatureFlags.ExternalSources,
    );
    const { data: resultsCacheFlag } = useServerFeatureFlag(
        FeatureFlags.ResultsCacheEnabled,
    );
    const isResultsCacheEnabled = resultsCacheFlag?.enabled ?? false;

    const { data: proLimitsFlag } = useServerFeatureFlag(
        FeatureFlags.ProLimits,
    );
    const isProLimitsEnabled = proLimitsFlag?.enabled ?? false;

    // The roadmap proxy is only registered behind a validated enterprise license.
    const isOrganizationRoadmapEnabled = health?.license?.valid === true;

    const { data: ssoOrganizationSettingsFlag } = useServerFeatureFlag(
        FeatureFlags.SsoOrganizationSettings,
    );
    const isSsoOrganizationSettingsEnabled =
        ssoOrganizationSettingsFlag?.enabled ?? false;

    const { data: emailWhitelabelFlag } = useServerFeatureFlag(
        FeatureFlags.EmailWhitelabel,
    );
    // Instance must be configured for whitelabelling (health) AND the org must
    // have the feature flag.
    const isEmailWhitelabelEnabled =
        (health?.hasEmailWhitelabel ?? false) &&
        (emailWhitelabelFlag?.enabled ?? false);

    const {
        data: organization,
        isInitialLoading: isOrganizationLoading,
        error: organizationError,
    } = useOrganization();
    const { activeProjectUuid, isLoading: isActiveProjectUuidLoading } =
        useActiveProjectUuid();
    // When viewing a specific project's settings, the sidebar follows the
    // project in the URL rather than the session's active project.
    const { pathname } = useLocation();
    const routeProjectUuid = matchPath(
        { path: '/generalSettings/projectManagement/:projectUuid/*' },
        pathname,
    )?.params.projectUuid;
    const settingsProjectUuid = routeProjectUuid ?? activeProjectUuid;
    const {
        data: project,
        isInitialLoading: isProjectLoading,
        error: projectError,
    } = useProject(settingsProjectUuid);

    const isGitProject = useIsGitProject(settingsProjectUuid ?? '');
    const {
        projectSettingsAccess,
        isProjectSettingsAccessLoading,
        projectSettingsAccessError,
    } = useProjectSettingsAccess(project);
    const { isAvailable: isContentReviewAvailable } =
        useContentReviewAvailability();

    // "Ask AI" settings are visible to org AI admins (all projects) and to
    // project-scoped AI admins (only the projects they can reach). These are
    // administration surfaces, so visibility mirrors the backend MANAGE gate
    // (resolveReadScope): `manage:OrganizationAiAgent` org-wide, else
    // `manage:AiAgent` over the access-filtered project list. Using `manage`
    // (not `view`) keeps interactive_viewers — who hold org-wide view:AiAgent —
    // out, matching what the backend actually authorizes.
    const { data: projects } = useProjects();
    const organizationUuid = organization?.organizationUuid;
    const {
        data: analyticsProjectFlag,
        isInitialLoading: isAnalyticsProjectFlagLoading,
    } = useServerFeatureFlag(FeatureFlags.AnalyticsProject);
    const canAccessAnalyticsSettings =
        analyticsProjectFlag?.enabled === true &&
        !!organizationUuid &&
        (user?.ability.can(
            'manage',
            subject('Organization', { organizationUuid }),
        ) ??
            false);
    const isOrganizationAdmin =
        !!organizationUuid &&
        (user?.ability.can(
            'manage',
            subject('Organization', { organizationUuid }),
        ) ??
            false);
    // The page only exists for an organization with a contract in force.
    const { data: aiCreditUsage, isInitialLoading: isAiCreditUsageLoading } =
        useAiCreditUsage({ enabled: isOrganizationAdmin });
    const canAccessAiCredits = aiCreditUsage?.canShowCredits === true;
    const canManageOrgAiAgent =
        user?.ability?.can(
            'manage',
            subject('OrganizationAiAgent', { organizationUuid }),
        ) ?? false;
    const hasAnyAiAgentAccess =
        canManageOrgAiAgent ||
        (projects ?? []).some((p) =>
            user?.ability?.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid,
                    projectUuid: p.projectUuid,
                }),
            ),
        );

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

    const {
        data: agentIdentityFlag,
        isInitialLoading: isAgentIdentityFlagLoading,
    } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const isAgentIdentityEnabled = agentIdentityFlag?.enabled ?? false;

    return {
        showMyAgentConnections,
        isMyAgentConnectionsLoading:
            isAgentIdentityFlagLoading ||
            agentIdentitySettings.isInitialLoading,
        user,
        health,
        organization,
        project,
        showImpersonationPanel,
        isCustomRolesEnabled,
        isProLimitsEnabled,
        canAccessAnalyticsSettings,
        isAnalyticsProjectFlagLoading,
        isOrganizationRoadmapEnabled,
        canAccessAiCredits,
        isAiCreditsLoading: isAiCreditUsageLoading,
        isSsoOrganizationSettingsEnabled,
        isEmailWhitelabelEnabled,
        isScimTokenManagementEnabled,
        isServiceAccountsEnabled,
        isAiCopilotEnabledOrTrial,
        shouldShowAiAgentReviews,
        canManageOrgAiAgent,
        hasAnyAiAgentAccess,
        isAiOrganizationSettingsLoading:
            aiOrganizationSettingsQuery.isInitialLoading,
        dataAppsFlag,
        dataAppAnalysisFlag,
        isDataAppGeneralSettingsEnabled,
        isDataAppsFlagLoading:
            dataAppsFlagQuery.isInitialLoading ||
            dataAppAnalysisFlagQuery.isInitialLoading,
        externalSourcesFlag,
        isResultsCacheEnabled,
        embeddingEnabled,
        allowPasswordAuthentication,
        hasSocialLogin,
        isGroupManagementEnabled,
        isWarehouseCredentialsEnabled,
        isAgentIdentityEnabled,
        isAgentIdentityFlagLoading,
        isGitProject,
        projectSettingsAccess,
        isProjectSettingsAccessLoading,
        projectSettingsAccessError,
        isContentReviewAvailable,
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
