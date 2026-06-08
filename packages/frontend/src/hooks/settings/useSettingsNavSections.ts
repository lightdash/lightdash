import { subject } from '@casl/ability';
import { CommercialFeatureFlags, FeatureFlags } from '@lightdash/common';
import {
    IconApps,
    IconAppWindow,
    IconBolt,
    IconBrain,
    IconBrowser,
    IconBrush,
    IconBuildingSkyscraper,
    IconCalendarStats,
    IconChecklist,
    IconClock,
    IconDatabase,
    IconDatabaseCog,
    IconDatabaseExport,
    IconFileExport,
    IconFolders,
    IconGauge,
    IconGitPullRequest,
    IconHistory,
    IconIdBadge2,
    IconKey,
    IconListCheck,
    IconLock,
    IconMessageCircle,
    IconPalette,
    IconPlug,
    IconRefresh,
    IconReportAnalytics,
    IconRobotFace,
    IconSettings,
    IconShieldCheck,
    IconTableOptions,
    IconTrash,
    IconUserCircle,
    IconUserCode,
    IconUserPlus,
    IconUsers,
    IconUserShield,
    IconVariable,
    IconWorldCheck,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { useIsGitProject } from '../../components/Explorer/WriteBackModal/hooks';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { useOrganization } from '../organization/useOrganization';
import { useActiveProjectUuid } from '../useActiveProject';
import { useProject } from '../useProject';
import { useServerFeatureFlag } from '../useServerOrClientFeatureFlag';
import {
    type SettingsNavItem,
    type SettingsNavSection,
    type UseSettingsNavSectionsResult,
} from './types';

/**
 * Assembles the runtime inputs the settings page gates on (user + abilities,
 * health/organization/project, git-connection, resolved feature flags) and
 * derives the gated sidebar nav model from them. Both the settings router and
 * sidebar — and, later, a global settings search — read from this one source;
 * each nav item carries `keywords` so search can match aliases.
 */
export const useSettingsNavSections = (): UseSettingsNavSectionsResult => {
    const { track } = useTracking();

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

    const isEmbeddingEnabled = embeddingEnabled?.enabled ?? false;
    const isScimEnabled = isScimTokenManagementEnabled?.enabled ?? false;
    const isDataAppsEnabled = dataAppsFlag?.enabled ?? false;

    const navSections = useMemo<SettingsNavSection[]>(() => {
        const ability = user?.ability;

        const yourSettings: SettingsNavItem[] = [
            {
                label: 'Profile',
                to: '/generalSettings/profile',
                icon: IconUserCircle,
                keywords: ['account', 'avatar', 'name'],
                children: [],
                exact: true,
            },
        ];

        if (allowPasswordAuthentication) {
            yourSettings.push({
                label: hasSocialLogin ? 'Password & Social Logins' : 'Password',
                to: '/generalSettings/password',
                icon: IconLock,
                keywords: ['login', 'security', 'mfa', 'social', 'sso'],
                children: [],
                exact: true,
            });
        }

        yourSettings.push({
            label: 'My warehouse connections',
            to: '/generalSettings/myWarehouseConnections',
            icon: IconDatabaseCog,
            keywords: ['database', 'credentials', 'warehouse'],
            children: [],
            exact: true,
        });

        if (ability?.can('create', 'ScheduledDeliveries')) {
            yourSettings.push({
                label: 'My scheduled deliveries',
                to: '/generalSettings/userScheduledDeliveries',
                icon: IconCalendarStats,
                keywords: ['email', 'reports', 'schedule'],
                children: [],
                exact: true,
            });
        }

        if (isDataAppsEnabled && ability?.can('create', 'DataApp')) {
            yourSettings.push({
                label: 'My apps',
                to: '/generalSettings/myApps',
                icon: IconAppWindow,
                keywords: ['data apps'],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('manage', 'PersonalAccessToken')) {
            yourSettings.push({
                label: 'Personal access tokens',
                to: '/generalSettings/personalAccessTokens',
                icon: IconKey,
                keywords: ['api', 'pat', 'token'],
                children: [],
                exact: true,
            });
        }

        const organizationItems: SettingsNavItem[] = [];

        if (ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: 'General',
                to: '/generalSettings/organization',
                icon: IconBuildingSkyscraper,
                keywords: [
                    'organization',
                    'domains',
                    'default project',
                    'danger zone',
                ],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: 'Exporting',
                to: '/generalSettings/exporting',
                icon: IconFileExport,
                keywords: ['export', 'csv', 'excel', 'downloads'],
                children: [],
                exact: true,
            });
        }

        if (isProLimitsEnabled && ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: 'Limits',
                to: '/generalSettings/limits',
                icon: IconGauge,
                keywords: ['rows', 'query', 'cells', 'export'],
                children: [],
                exact: true,
            });
        }

        if (isCustomRolesEnabled && ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: 'Custom roles',
                to: '/generalSettings/customRoles',
                icon: IconIdBadge2,
                keywords: ['permissions', 'access', 'scopes'],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('update', 'OrganizationMemberProfile')) {
            organizationItems.push({
                label: isGroupManagementEnabled
                    ? 'Users & groups'
                    : 'User management',
                to: '/generalSettings/userManagement',
                icon: IconUserPlus,
                keywords: ['members', 'invite', 'teams', 'groups'],
                children: [],
                exact: true,
            });
        }

        if (
            ability?.can(
                'manage',
                subject('Organization', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            organizationItems.push({
                label: isGroupManagementEnabled
                    ? 'User & group attributes'
                    : 'User attributes',
                to: '/generalSettings/userAttributes',
                icon: IconUserShield,
                keywords: ['attributes', 'access control'],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('update', 'Organization')) {
            organizationItems.push({
                label: 'Appearance',
                to: '/generalSettings/appearance',
                icon: IconPalette,
                keywords: ['theme', 'color', 'branding', 'logo'],
                children: [],
                exact: true,
            });
        }

        if (isDataAppsEnabled && ability?.can('view', 'OrganizationDesign')) {
            organizationItems.push({
                label: 'Themes',
                to: '/generalSettings/themes',
                icon: IconBrush,
                keywords: ['design', 'colors', 'charts'],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: 'Integrations',
                to: '/generalSettings/integrations',
                icon: IconPlug,
                keywords: ['slack', 'github', 'gitlab'],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: 'OAuth applications',
                to: '/generalSettings/oauthClients',
                icon: IconApps,
                keywords: ['oauth', 'clients', 'api'],
                children: [],
                exact: true,
            });
        }

        if (
            ability?.can('manage', 'Organization') &&
            isSsoOrganizationSettingsEnabled
        ) {
            organizationItems.push({
                label: 'Verified domains',
                to: '/generalSettings/verifiedDomains',
                icon: IconWorldCheck,
                keywords: ['email', 'domains', 'sso'],
                children: [],
                exact: true,
            });
        }

        if (
            ability?.can('manage', 'Organization') &&
            isSsoOrganizationSettingsEnabled
        ) {
            organizationItems.push({
                label: 'Single Sign-On',
                to: '/generalSettings/sso',
                icon: IconLock,
                keywords: [
                    'sso',
                    'saml',
                    'oidc',
                    'okta',
                    'azure',
                    'onelogin',
                    'google',
                ],
                children: [],
                exact: true,
            });
        }

        if (
            ability?.can(
                'manage',
                subject('OrganizationWarehouseCredentials', {
                    organizationUuid: organization?.organizationUuid,
                }),
            ) &&
            isWarehouseCredentialsEnabled
        ) {
            organizationItems.push({
                label: 'Warehouse credentials',
                to: '/generalSettings/warehouseCredentials',
                icon: IconDatabaseCog,
                keywords: ['database', 'credentials'],
                children: [],
                exact: true,
            });
        }

        if (
            organization &&
            !organization.needsProject &&
            ability?.can('view', 'Project')
        ) {
            organizationItems.push({
                label: 'All projects',
                to: '/generalSettings/projectManagement',
                icon: IconDatabase,
                keywords: ['projects', 'manage'],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('manage', 'Organization') && isScimEnabled) {
            organizationItems.push({
                label: 'SCIM access tokens',
                to: '/generalSettings/scimAccessTokens',
                icon: IconKey,
                keywords: ['scim', 'provisioning', 'tokens'],
                children: [],
                exact: true,
            });
        }

        if (
            ability?.can('manage', 'Organization') &&
            isServiceAccountsEnabled
        ) {
            organizationItems.push({
                label: 'Service accounts',
                to: '/generalSettings/serviceAccounts',
                icon: IconUserCode,
                keywords: ['api', 'ci', 'automation', 'tokens'],
                children: [],
                exact: true,
            });
        }

        if (
            isAiCopilotEnabledOrTrial &&
            ability?.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            const aiChildren: SettingsNavItem[] = [
                {
                    label: 'General',
                    to: '/generalSettings/ai/general',
                    icon: IconSettings,
                    keywords: ['ai', 'settings'],
                    children: [],
                    exact: true,
                },
                {
                    label: 'Threads',
                    to: '/generalSettings/ai/threads',
                    icon: IconMessageCircle,
                    keywords: ['conversations'],
                    children: [],
                    exact: true,
                },
                {
                    label: 'Agents',
                    to: '/generalSettings/ai/agents',
                    icon: IconRobotFace,
                    keywords: ['bots'],
                    children: [],
                    exact: true,
                },
            ];

            if (shouldShowAiAgentReviews) {
                aiChildren.push({
                    label: 'Reviews',
                    to: '/generalSettings/ai/reviews',
                    icon: IconListCheck,
                    keywords: ['classifier'],
                    children: [],
                    exact: true,
                });
            }

            organizationItems.push({
                label: 'Ask AI',
                to: '/generalSettings/ai',
                icon: IconBrain,
                keywords: ['copilot', 'agents', 'ai'],
                children: aiChildren,
            });
        }

        const sections: SettingsNavSection[] = [
            {
                id: 'your-settings',
                title: 'Your settings',
                subtitle: null,
                items: yourSettings,
            },
            {
                id: 'organization',
                title: 'Organization settings',
                subtitle: null,
                items: organizationItems,
            },
        ];

        const canUpdateCurrentProject =
            !!organization &&
            !organization.needsProject &&
            !!project &&
            (ability?.can(
                'update',
                subject('Project', {
                    organizationUuid: organization.organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            ) ??
                false);

        if (canUpdateCurrentProject && project && organization) {
            const base = `/generalSettings/projectManagement/${project.projectUuid}`;
            const projectItems: SettingsNavItem[] = [
                {
                    label: 'Connection settings',
                    to: `${base}/settings`,
                    icon: IconDatabaseCog,
                    keywords: ['warehouse', 'dbt', 'database'],
                    children: [],
                    exact: true,
                },
                {
                    label: 'Tables configuration',
                    to: `${base}/tablesConfiguration`,
                    icon: IconTableOptions,
                    keywords: ['models', 'explores'],
                    children: [],
                    exact: true,
                },
                {
                    label: 'Changesets',
                    to: `${base}/changesets`,
                    icon: IconHistory,
                    keywords: ['changes', 'history'],
                    children: [],
                    exact: true,
                },
                {
                    label: 'Compilation history',
                    to: `${base}/compilationHistory`,
                    icon: IconRefresh,
                    keywords: ['dbt', 'refresh', 'logs'],
                    children: [],
                    exact: true,
                },
            ];

            if (health?.preAggregates.enabled) {
                projectItems.push({
                    label: 'Pre-aggregates',
                    to: `${base}/preAggregates`,
                    icon: IconBolt,
                    keywords: ['cache', 'materialization', 'performance'],
                    children: [
                        {
                            label: 'Materializations',
                            to: `${base}/preAggregates/materializations`,
                            icon: IconDatabase,
                            keywords: ['cache'],
                            children: [],
                            exact: true,
                        },
                        {
                            label: 'Analytics',
                            to: `${base}/preAggregates/audit`,
                            icon: IconReportAnalytics,
                            keywords: ['usage', 'audit'],
                            children: [],
                            exact: true,
                        },
                    ],
                });
            }

            projectItems.push({
                label: 'Parameters',
                to: `${base}/parameters`,
                icon: IconVariable,
                keywords: ['variables'],
                children: [],
                exact: true,
            });

            projectItems.push(
                {
                    label: 'Project time zone',
                    to: `${base}/queryTimezone`,
                    icon: IconClock,
                    keywords: ['timezone', 'time', 'query'],
                    children: [],
                    exact: true,
                },
                {
                    label: 'Preview settings',
                    to: `${base}/previewsConfig`,
                    icon: IconUserCode,
                    keywords: ['preview', 'developer', 'expiration'],
                    children: [],
                    exact: true,
                },
                {
                    label: 'Appearance',
                    to: `${base}/appearance`,
                    icon: IconPalette,
                    keywords: ['theme', 'color', 'branding'],
                    children: [],
                    exact: true,
                },
            );

            if (
                ability?.can(
                    'manage',
                    subject('Project', {
                        organizationUuid: organization.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectItems.push(
                    {
                        label: 'Project access',
                        to: `${base}/projectAccess`,
                        icon: IconUsers,
                        keywords: ['members', 'permissions', 'sharing'],
                        children: [],
                        exact: true,
                    },
                    {
                        label: 'Default user spaces',
                        to: `${base}/defaultUserSpaces`,
                        icon: IconFolders,
                        keywords: ['spaces', 'folders'],
                        children: [],
                        exact: true,
                    },
                );
            }

            if (
                ability?.can(
                    'view',
                    subject('Analytics', {
                        organizationUuid: organization.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectItems.push({
                    label: 'Usage analytics',
                    to: `${base}/usageAnalytics`,
                    icon: IconReportAnalytics,
                    keywords: ['stats', 'metrics', 'dashboards'],
                    children: [],
                    exact: true,
                    onClick: () => {
                        track({ name: EventName.USAGE_ANALYTICS_CLICKED });
                    },
                });
            }

            projectItems.push({
                label: 'Syncs & Scheduled deliveries',
                to: `${base}/scheduledDeliveries`,
                icon: IconCalendarStats,
                keywords: ['email', 'reports', 'sync', 'dbt'],
                children: [],
                exact: true,
            });

            if (
                ability?.can(
                    'update',
                    subject('Project', {
                        organizationUuid: project.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                ) &&
                isEmbeddingEnabled
            ) {
                projectItems.push({
                    label: 'Embed configuration',
                    to: `${base}/embed`,
                    icon: IconBrowser,
                    keywords: ['embed', 'iframe', 'public'],
                    children: [],
                    exact: true,
                });
            }

            if (
                ability?.can(
                    'manage',
                    subject('Validation', {
                        organizationUuid: project.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectItems.push({
                    label: 'Validator',
                    to: `${base}/validator`,
                    icon: IconChecklist,
                    keywords: ['validation', 'errors', 'content'],
                    children: [],
                    exact: true,
                });
            }

            if (
                ability?.can(
                    'manage',
                    subject('ContentVerification', {
                        organizationUuid: project.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectItems.push({
                    label: 'Verified content',
                    to: `${base}/verifiedContent`,
                    icon: IconShieldCheck,
                    keywords: ['certified', 'trusted'],
                    children: [],
                    exact: true,
                });
            }

            if (
                ability?.can(
                    'promote',
                    subject('SavedChart', {
                        organizationUuid: project.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectItems.push({
                    label: 'Data ops',
                    to: `${base}/dataOps`,
                    icon: IconDatabaseExport,
                    keywords: ['promote', 'deploy', 'content as code'],
                    children: [],
                    exact: true,
                });
            }

            if (
                isGitProject &&
                ability?.can(
                    'view',
                    subject('SourceCode', {
                        organizationUuid: project.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectItems.push({
                    label: 'Pull requests',
                    to: `${base}/pullRequests`,
                    icon: IconGitPullRequest,
                    keywords: ['git', 'github', 'write back'],
                    children: [],
                    exact: true,
                });
            }

            if (health?.softDelete?.enabled) {
                projectItems.push({
                    label: 'Recently deleted',
                    to: `${base}/recentlyDeleted`,
                    icon: IconTrash,
                    keywords: ['trash', 'restore', 'deleted'],
                    children: [],
                    exact: true,
                });
            }

            sections.push({
                id: 'current-project',
                title: 'Current project',
                subtitle: project.name,
                items: projectItems,
            });
        }

        return sections;
    }, [
        user?.ability,
        organization,
        project,
        health,
        allowPasswordAuthentication,
        hasSocialLogin,
        isGroupManagementEnabled,
        isProLimitsEnabled,
        isCustomRolesEnabled,
        isSsoOrganizationSettingsEnabled,
        isWarehouseCredentialsEnabled,
        isScimEnabled,
        isServiceAccountsEnabled,
        isAiCopilotEnabledOrTrial,
        shouldShowAiAgentReviews,
        isEmbeddingEnabled,
        isDataAppsEnabled,
        isGitProject,
        track,
    ]);

    return {
        navSections,
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
        allowPasswordAuthentication,
        hasSocialLogin,
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
