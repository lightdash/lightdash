import { subject } from '@casl/ability';
import { AGENT_IDENTITY_SETTINGS_PATH } from '@lightdash/common';
import {
    IconApps,
    IconAppWindow,
    IconBolt,
    IconBook2,
    IconBrain,
    IconBrowser,
    IconBrush,
    IconBuildingSkyscraper,
    IconCalendarStats,
    IconChecklist,
    IconClock,
    IconCoins,
    IconDatabase,
    IconDatabaseCog,
    IconDatabaseExport,
    IconEyeCheck,
    IconFileExport,
    IconFolders,
    IconGauge,
    IconGitPullRequest,
    IconIdBadge2,
    IconKey,
    IconListCheck,
    IconLock,
    IconMailForward,
    IconMessageCircle,
    IconNotebook,
    IconPalette,
    IconPlug,
    IconPlugConnected,
    IconRefresh,
    IconReportAnalytics,
    IconRoad,
    IconRobotFace,
    IconSend,
    IconSettings,
    IconShieldCheck,
    IconSparkles,
    IconTableOptions,
    IconTelescope,
    IconTrash,
    IconUserCircle,
    IconUserCode,
    IconUserPlus,
    IconUsers,
    IconUserShield,
    IconVariable,
    IconWorldCheck,
    IconWorldCog,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { canAccessDeepResearchSettings } from './deepResearchSettingsAccess';
import { type LimitedProjectSettingsPage } from './projectSettingsAccess';
import {
    type SettingsContext,
    type SettingsNavigationItem,
    type SettingsNavigationSection,
} from './types';

/**
 * Derives the gated settings sidebar nav model from a `SettingsContext` (see
 * `useSettingsContext`). Only items the user is permitted to see are included,
 * so the sidebar can render the result as a dumb map; each item carries
 * `keywords` so a future settings search can match aliases.
 */
export const useSettingsNavigation = (
    context: SettingsContext,
): SettingsNavigationSection[] => {
    const { t } = useTranslation('app');
    const { track } = useTracking();
    const {
        user,
        organization,
        project,
        health,
        allowPasswordAuthentication,
        hasSocialLogin,
        isGroupManagementEnabled,
        isProLimitsEnabled,
        canAccessAnalyticsSettings,
        isOrganizationRoadmapEnabled,
        canAccessAiCredits,
        isCustomRolesEnabled,
        isSsoOrganizationSettingsEnabled,
        isEmailWhitelabelEnabled,
        isWarehouseCredentialsEnabled,
        showMyAgentConnections,
        isAgentIdentityEnabled,
        isScimTokenManagementEnabled,
        isServiceAccountsEnabled,
        isAiCopilotEnabledOrTrial,
        shouldShowAiAgentReviews,
        canManageOrgAiAgent,
        hasAnyAiAgentAccess,
        embeddingEnabled,
        dataAppsFlag,
        dataAppAnalysisFlag,
        isDataAppGeneralSettingsEnabled,
        externalSourcesFlag,
        isResultsCacheEnabled,
        isGitProject,
        isContentReviewAvailable,
        projectSettingsAccess,
    } = context;

    const isEmbeddingEnabled = embeddingEnabled?.enabled ?? false;
    const isScimEnabled = isScimTokenManagementEnabled?.enabled ?? false;
    const isDataAppsEnabled = dataAppsFlag?.enabled ?? false;
    const isDataAppAnalysisEnabled = dataAppAnalysisFlag?.enabled ?? false;
    const isExternalSourcesEnabled = externalSourcesFlag?.enabled ?? false;

    return useMemo<SettingsNavigationSection[]>(() => {
        const ability = user?.ability;

        const yourSettings: SettingsNavigationItem[] = [
            {
                label: t('useSettingsNavigation.profile'),
                to: '/generalSettings/profile',
                icon: IconUserCircle,
                keywords: ['account', 'avatar', 'name'],
                children: [],
                exact: true,
            },
        ];

        if (allowPasswordAuthentication) {
            yourSettings.push({
                label: hasSocialLogin
                    ? t('useSettingsNavigation.passwordAndSocialLogins')
                    : t('useSettingsNavigation.password'),
                to: '/generalSettings/password',
                icon: IconLock,
                keywords: ['login', 'security', 'mfa', 'social', 'sso'],
                children: [],
                exact: true,
            });
        }

        yourSettings.push({
            label: t('useSettingsNavigation.myWarehouseConnections'),
            to: '/generalSettings/myWarehouseConnections',
            icon: IconDatabaseCog,
            keywords: ['database', 'credentials', 'warehouse'],
            children: [],
            exact: true,
        });

        if (showMyAgentConnections) {
            yourSettings.push({
                label: t('useSettingsNavigation.myAgentIdentity'),
                to: '/generalSettings/myAgentConnections',
                icon: IconPlugConnected,
                keywords: [
                    'agent',
                    'identity',
                    'sign-in',
                    'ai',
                    'mcp',
                    'snowflake',
                    'bigquery',
                    'connect',
                ],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('create', 'ScheduledDeliveries')) {
            yourSettings.push({
                label: t('useSettingsNavigation.myScheduledDeliveries'),
                to: '/generalSettings/userScheduledDeliveries',
                icon: IconCalendarStats,
                keywords: ['email', 'reports', 'schedule'],
                children: [],
                exact: true,
            });
        }

        if (isDataAppsEnabled && ability?.can('create', 'DataApp')) {
            yourSettings.push({
                label: t('useSettingsNavigation.myApps'),
                to: '/generalSettings/myApps',
                icon: IconAppWindow,
                keywords: ['data apps'],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('manage', 'PersonalAccessToken')) {
            yourSettings.push({
                label: t('useSettingsNavigation.personalAccessTokens'),
                to: '/generalSettings/personalAccessTokens',
                icon: IconKey,
                keywords: ['api', 'pat', 'token'],
                children: [],
                exact: true,
            });
        }

        const organizationItems: SettingsNavigationItem[] = [];

        if (ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: t('useSettingsNavigation.general'),
                to: '/generalSettings/organization',
                icon: IconBuildingSkyscraper,
                keywords: [
                    'organization',
                    'domains',
                    'default project',
                    'danger zone',
                ],
                pageSections: [
                    {
                        title: t('useSettingsNavigation.allowedEmailDomains'),
                        keywords: ['email', 'domain', 'auto join'],
                    },
                    {
                        title: t('useSettingsNavigation.defaultProject'),
                        keywords: ['landing project', 'home project'],
                    },
                    {
                        title: t('useSettingsNavigation.userImpersonation'),
                        keywords: ['impersonate', 'impersonation'],
                    },
                    {
                        title: t(
                            'useSettingsNavigation.lightdashSupportAccess',
                        ),
                        keywords: ['support', 'impersonate', 'impersonation'],
                    },
                    {
                        title: t('useSettingsNavigation.dangerZone'),
                        keywords: ['delete organization', 'leave organization'],
                    },
                ],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: t('useSettingsNavigation.exporting'),
                to: '/generalSettings/exporting',
                icon: IconFileExport,
                keywords: ['export', 'csv', 'excel', 'downloads'],
                children: [],
                exact: true,
            });
        }

        if (isProLimitsEnabled && ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: t('useSettingsNavigation.limits'),
                to: '/generalSettings/limits',
                icon: IconGauge,
                keywords: ['rows', 'query', 'cells', 'export'],
                children: [],
                exact: true,
            });
        }

        if (isCustomRolesEnabled && ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: t('useSettingsNavigation.customRoles'),
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
                    ? t('useSettingsNavigation.usersAndGroups')
                    : t('useSettingsNavigation.userManagement'),
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
                    ? t('useSettingsNavigation.userAndGroupAttributes')
                    : t('useSettingsNavigation.userAttributes'),
                to: '/generalSettings/userAttributes',
                icon: IconUserShield,
                keywords: ['attributes', 'access control'],
                children: [],
                exact: true,
            });
        }

        if (
            ability?.can('update', 'Organization') ||
            ability?.can(
                'manage',
                subject('OrganizationColorPalette', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            organizationItems.push({
                label: t('useSettingsNavigation.appearance'),
                to: '/generalSettings/appearance',
                icon: IconPalette,
                keywords: ['theme', 'color', 'branding', 'logo', 'palette'],
                children: [],
                exact: true,
            });
        }

        if (isDataAppsEnabled) {
            const dataAppChildren: SettingsNavigationItem[] = [];

            if (
                isDataAppGeneralSettingsEnabled &&
                ability?.can('manage', 'Organization')
            ) {
                dataAppChildren.push({
                    label: t('useSettingsNavigation.general'),
                    to: '/generalSettings/dataApps/general',
                    icon: IconSettings,
                    keywords: [
                        'thumbnail',
                        'thumbnails',
                        'automatic capture',
                        'card image',
                    ],
                    children: [],
                    exact: true,
                });
            }

            if (ability?.can('manage', 'OrganizationDesign')) {
                dataAppChildren.push({
                    label: t('useSettingsNavigation.themes'),
                    to: '/generalSettings/dataApps/themes',
                    icon: IconBrush,
                    keywords: ['design', 'colors', 'charts'],
                    children: [],
                    exact: true,
                });
            }

            if (ability?.can('manage', 'Organization')) {
                dataAppChildren.push({
                    label: t('useSettingsNavigation.activity'),
                    to: '/generalSettings/dataApps/activity',
                    icon: IconReportAnalytics,
                    keywords: [
                        'usage',
                        'audit',
                        'log',
                        'generations',
                        'who built',
                        'tokens',
                    ],
                    children: [],
                    exact: true,
                });
            }

            if (
                isDataAppAnalysisEnabled &&
                ability?.can('manage', 'Organization')
            ) {
                dataAppChildren.push({
                    label: t('useSettingsNavigation.aiAnalysis'),
                    to: '/generalSettings/dataApps/aiAnalysis',
                    icon: IconSparkles,
                    keywords: [
                        'ai',
                        'analysis',
                        'insights',
                        'anomalies',
                        'investigate',
                        'auto',
                    ],
                    children: [],
                    exact: true,
                });
            }

            if (dataAppChildren.length > 0) {
                organizationItems.push({
                    label: t('useSettingsNavigation.dataApps'),
                    to: '/generalSettings/dataApps',
                    icon: IconAppWindow,
                    keywords: ['apps', 'data apps'],
                    children: dataAppChildren,
                });
            }
        }

        if (ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: t('useSettingsNavigation.integrations'),
                to: '/generalSettings/integrations',
                icon: IconPlug,
                keywords: ['slack', 'github', 'gitlab', 'linear', 'jira'],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: t('useSettingsNavigation.oauthApplications'),
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
                label: t('useSettingsNavigation.verifiedDomains'),
                to: '/generalSettings/verifiedDomains',
                icon: IconWorldCheck,
                keywords: ['email', 'domains', 'sso'],
                children: [],
                exact: true,
            });
        }

        if (
            ability?.can('manage', 'Organization') &&
            isEmailWhitelabelEnabled
        ) {
            organizationItems.push({
                label: t('useSettingsNavigation.emailDomain'),
                to: '/generalSettings/emailWhitelabel',
                icon: IconMailForward,
                keywords: [
                    'email',
                    'whitelabel',
                    'sending',
                    'domain',
                    'dkim',
                    'reports',
                ],
                children: [],
                exact: true,
            });
        }

        if (
            ability?.can('manage', 'Organization') &&
            isSsoOrganizationSettingsEnabled
        ) {
            organizationItems.push({
                label: t('useSettingsNavigation.singleSignOn'),
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
                label: t('useSettingsNavigation.warehouseCredentials'),
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
                label: t('useSettingsNavigation.allProjects'),
                to: '/generalSettings/projectManagement',
                icon: IconDatabase,
                keywords: ['projects', 'manage'],
                children: [],
                exact: true,
            });
        }

        if (canAccessAnalyticsSettings) {
            organizationItems.push({
                label: t('useSettingsNavigation.lightdashAnalytics'),
                to: '/generalSettings/lightdashAnalytics',
                icon: IconReportAnalytics,
                isBeta: true,
                keywords: ['usage', 'analytics', 'tokens', 'queries'],
                children: [],
                exact: true,
            });
        }

        if (ability?.can('manage', 'Organization') && isScimEnabled) {
            organizationItems.push({
                label: t('useSettingsNavigation.scimAccessTokens'),
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
                label: t('useSettingsNavigation.serviceAccounts'),
                to: '/generalSettings/serviceAccounts',
                icon: IconUserCode,
                keywords: ['api', 'ci', 'automation', 'tokens'],
                children: [],
                exact: true,
            });
        }

        if (canAccessAiCredits) {
            organizationItems.push({
                label: t('useSettingsNavigation.aiCredits'),
                to: '/generalSettings/aiCredits',
                icon: IconCoins,
                keywords: ['ai', 'credits', 'usage', 'allowance', 'billing'],
                children: [],
                exact: true,
            });
        }

        if (isAiCopilotEnabledOrTrial && hasAnyAiAgentAccess) {
            const aiChildren: SettingsNavigationItem[] = [];
            // General is org-wide config (router, org settings) — org admins only.
            if (canManageOrgAiAgent) {
                aiChildren.push({
                    label: t('useSettingsNavigation.general'),
                    to: '/generalSettings/ai/general',
                    icon: IconSettings,
                    keywords: ['ai', 'settings'],
                    children: [],
                    exact: true,
                });
            }
            // Threads & Agents are project-filtered for project-scoped users.
            aiChildren.push(
                {
                    label: t('useSettingsNavigation.threads'),
                    to: '/generalSettings/ai/threads',
                    icon: IconMessageCircle,
                    keywords: ['conversations'],
                    children: [],
                    exact: true,
                },
                {
                    label: t('useSettingsNavigation.agents'),
                    to: '/generalSettings/ai/agents',
                    icon: IconRobotFace,
                    keywords: ['bots'],
                    children: [],
                    exact: true,
                },
                {
                    label: t('useSettingsNavigation.evals'),
                    to: '/generalSettings/ai/evals',
                    icon: IconBook2,
                    keywords: ['evaluations', 'evals', 'runs', 'testing'],
                    children: [],
                    exact: true,
                },
            );

            if (shouldShowAiAgentReviews) {
                aiChildren.push({
                    label: t('useSettingsNavigation.issues'),
                    to: '/generalSettings/ai/issues',
                    icon: IconListCheck,
                    keywords: ['classifier', 'reviews'],
                    children: [],
                    exact: true,
                });
            }

            aiChildren.push({
                label: t('useSettingsNavigation.memories'),
                to: '/generalSettings/ai/memories',
                icon: IconNotebook,
                keywords: ['memory', 'memories', 'learned', 'knowledge'],
                children: [],
                exact: true,
            });

            if (
                canAccessDeepResearchSettings({
                    isAiCopilotEnabledOrTrial,
                    canManageOrgAiAgent,
                    hasAnyAiAgentAccess,
                })
            ) {
                aiChildren.push({
                    label: t('useSettingsNavigation.deepResearch'),
                    to: '/generalSettings/ai/deep-research',
                    icon: IconTelescope,
                    keywords: ['research', 'limits', 'tools', 'queries'],
                    children: [],
                    exact: true,
                });
            }

            organizationItems.push({
                label: t('useSettingsNavigation.askAi'),
                to: '/generalSettings/ai',
                icon: IconBrain,
                aiAgentIcon: true,
                keywords: ['copilot', 'agents', 'ai'],
                children: aiChildren,
            });
        }

        if (isAgentIdentityEnabled && ability?.can('manage', 'Organization')) {
            organizationItems.push({
                label: t('useSettingsNavigation.agents'),
                to: AGENT_IDENTITY_SETTINGS_PATH,
                icon: IconIdBadge2,
                keywords: [
                    'agents',
                    'identity',
                    'agent identity',
                    'permissions',
                    'shared agent account',
                    'warehouse',
                    'snowflake',
                    'bigquery',
                ],
                pageSections: [
                    {
                        title: t('useSettingsNavigation.identity'),
                        keywords: [
                            'who agents run as',
                            'shared agent account',
                            'agent sign-in',
                        ],
                    },
                    {
                        title: t('useSettingsNavigation.permissions'),
                        keywords: [
                            'limit what agents can do',
                            'who can use agents',
                            'agent permissions',
                            'allowed projects',
                            'raw sql',
                        ],
                    },
                ],
                children: [],
                exact: true,
            });
        }

        const mcpChildren: SettingsNavigationItem[] = [
            {
                label: t('useSettingsNavigation.connect'),
                to: '/generalSettings/mcp/connect',
                icon: IconPlugConnected,
                keywords: ['mcp', 'setup', 'installation', 'connect'],
                pageSections: [
                    {
                        title: t('useSettingsNavigation.clientSetup'),
                        keywords: [
                            'setup',
                            'connect',
                            'http',
                            'claude',
                            'codex',
                            'cursor',
                            'vscode',
                        ],
                    },
                ],
                children: [],
                exact: true,
            },
        ];
        if (isAiCopilotEnabledOrTrial && hasAnyAiAgentAccess) {
            if (canManageOrgAiAgent) {
                mcpChildren.push({
                    label: t('useSettingsNavigation.general'),
                    to: '/generalSettings/mcp/general',
                    icon: IconSettings,
                    keywords: [
                        'mcp',
                        'settings',
                        'agents',
                        'content',
                        'writes',
                    ],
                    pageSections: [
                        {
                            title: t(
                                'useSettingsNavigation.enableAgentsOverMcp',
                            ),
                            keywords: ['tools', 'context', 'access'],
                        },
                        {
                            title: t(
                                'useSettingsNavigation.allowContentChangesViaMcp',
                            ),
                            keywords: [
                                'charts',
                                'dashboards',
                                'create',
                                'edit',
                            ],
                        },
                    ],
                    children: [],
                    exact: true,
                });
            }
            mcpChildren.push({
                label: t('useSettingsNavigation.analytics'),
                to: '/generalSettings/mcp/analytics',
                icon: IconReportAnalytics,
                keywords: [
                    'mcp',
                    'tools',
                    'activity',
                    'usage',
                    'errors',
                    'audit',
                ],
                children: [],
                exact: true,
            });
        }
        organizationItems.push({
            label: t('useSettingsNavigation.mcp'),
            to: '/generalSettings/mcp',
            icon: IconPlugConnected,
            keywords: ['model context protocol', 'claude', 'cursor'],
            children: mcpChildren,
        });

        if (
            isOrganizationRoadmapEnabled &&
            ability?.can(
                'view',
                subject('Roadmap', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            organizationItems.push({
                label: t('useSettingsNavigation.roadmap'),
                to: '/generalSettings/roadmap',
                icon: IconRoad,
                keywords: [
                    'feature requests',
                    'planned',
                    'building',
                    'shipped',
                ],
                children: [],
                exact: true,
            });
        }

        const sections: SettingsNavigationSection[] = [
            {
                id: 'your-settings',
                title: t('useSettingsNavigation.yourSettings'),
                subtitle: null,
                items: yourSettings,
            },
            {
                id: 'organization',
                title: t('useSettingsNavigation.organizationSettings'),
                subtitle: null,
                items: organizationItems,
            },
        ];

        const hasProjectSettings =
            !!organization && !organization.needsProject && !!project;
        const canUpdateCurrentProject =
            hasProjectSettings && projectSettingsAccess.type === 'full';
        const base = `/generalSettings/projectManagement/${project?.projectUuid}`;
        const limitedItems: Record<
            LimitedProjectSettingsPage,
            SettingsNavigationItem
        > = {
            validator: {
                label: t('useSettingsNavigation.validator'),
                to: `${base}/validator`,
                icon: IconChecklist,
                keywords: ['validation', 'errors', 'content'],
                children: [],
                exact: true,
                tourNav: 'validator',
            },
            recentlyDeleted: {
                label: t('useSettingsNavigation.recentlyDeleted'),
                to: `${base}/recentlyDeleted`,
                icon: IconTrash,
                keywords: ['trash', 'restore', 'deleted'],
                children: [],
                exact: true,
                tourNav: 'recently-deleted',
            },
        };

        if (
            hasProjectSettings &&
            project &&
            projectSettingsAccess.type === 'limited'
        ) {
            sections.push({
                id: 'current-project',
                title: t('useSettingsNavigation.currentProject'),
                subtitle: project.name,
                items: projectSettingsAccess.pages.map(
                    (page) => limitedItems[page],
                ),
            });
        }

        if (canUpdateCurrentProject && project && organization) {
            const projectItems: SettingsNavigationItem[] = [
                {
                    label: t('useSettingsNavigation.connectionSettings'),
                    to: `${base}/settings`,
                    icon: IconDatabaseCog,
                    keywords: ['warehouse', 'dbt', 'database'],
                    children: [],
                    exact: true,
                },
                {
                    label: t('useSettingsNavigation.tablesConfiguration'),
                    to: `${base}/tablesConfiguration`,
                    icon: IconTableOptions,
                    keywords: ['models', 'explores'],
                    children: [],
                    exact: true,
                },
                ...(isAgentIdentityEnabled &&
                ability?.can(
                    'manage',
                    subject('Project', {
                        organizationUuid: project.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
                    ? [
                          {
                              label: t('useSettingsNavigation.agentIdentity'),
                              to: `${base}/agentIdentity`,
                              icon: IconIdBadge2,
                              keywords: ['ai', 'agent', 'credentials'],
                              children: [],
                              exact: true,
                          },
                      ]
                    : []),
                // Only meaningful when the instance has AI agents at all —
                // same gate as the org-level AI agents section.
                ...(isAiCopilotEnabledOrTrial
                    ? [
                          {
                              label: t('useSettingsNavigation.agentDataScope'),
                              to: `${base}/agentDataScope`,
                              icon: IconDatabaseCog,
                              keywords: [
                                  'ai',
                                  'agent',
                                  'sql',
                                  'schema',
                                  'catalog',
                                  'scope',
                              ],
                              children: [],
                              exact: true,
                          },
                      ]
                    : []),
                // Selecting a region is gated on organization-level AI
                // administration to match the backend: both the credential
                // list and the project selection require
                // manage:OrganizationAiAgent, so a project admin without it
                // would land on a page whose queries 403.
                ...(isAiCopilotEnabledOrTrial && canManageOrgAiAgent
                    ? [
                          {
                              label: t('useSettingsNavigation.aiRegion'),
                              to: `${base}/aiRegion`,
                              icon: IconWorldCog,
                              keywords: [
                                  'ai',
                                  'bedrock',
                                  'region',
                                  'residency',
                                  'locality',
                                  'credential',
                              ],
                              children: [],
                              exact: true,
                          },
                      ]
                    : []),
                {
                    label: t('useSettingsNavigation.compilationHistory'),
                    to: `${base}/compilationHistory`,
                    icon: IconRefresh,
                    keywords: ['dbt', 'refresh', 'logs'],
                    children: [],
                    exact: true,
                },
            ];

            if (health?.preAggregates.enabled) {
                projectItems.push({
                    label: t('useSettingsNavigation.preAggregates'),
                    to: `${base}/preAggregates`,
                    icon: IconBolt,
                    keywords: ['cache', 'materialization', 'performance'],
                    children: [
                        {
                            label: t('useSettingsNavigation.materializations'),
                            to: `${base}/preAggregates/materializations`,
                            icon: IconDatabase,
                            keywords: ['cache'],
                            children: [],
                            exact: true,
                        },
                        {
                            label: t('useSettingsNavigation.analytics'),
                            to: `${base}/preAggregates/audit`,
                            icon: IconReportAnalytics,
                            keywords: ['usage', 'audit'],
                            children: [],
                            exact: true,
                        },
                    ],
                });
            }

            if (isResultsCacheEnabled) {
                projectItems.push({
                    label: t('useSettingsNavigation.resultsCaching'),
                    to: `${base}/caching`,
                    icon: IconDatabaseExport,
                    keywords: [
                        'cache',
                        'results',
                        'duration',
                        'expire',
                        'refresh',
                    ],
                    children: [],
                    exact: true,
                });
            }

            projectItems.push({
                label: t('useSettingsNavigation.parameters'),
                to: `${base}/parameters`,
                icon: IconVariable,
                keywords: ['variables'],
                children: [],
                exact: true,
            });

            projectItems.push(
                {
                    label: t('useSettingsNavigation.projectTimeZone'),
                    to: `${base}/queryTimezone`,
                    icon: IconClock,
                    keywords: ['timezone', 'time', 'query'],
                    children: [],
                    exact: true,
                },
                {
                    label: t('useSettingsNavigation.previewSettings'),
                    to: `${base}/previewsConfig`,
                    icon: IconUserCode,
                    keywords: ['preview', 'developer', 'expiration'],
                    children: [],
                    exact: true,
                },
                {
                    label: t('useSettingsNavigation.appearance'),
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
                        label: t('useSettingsNavigation.projectAccess'),
                        to: `${base}/projectAccess`,
                        icon: IconUsers,
                        keywords: ['members', 'permissions', 'sharing'],
                        children: [],
                        exact: true,
                    },
                    {
                        label: t('useSettingsNavigation.defaultUserSpaces'),
                        to: `${base}/defaultUserSpaces`,
                        icon: IconFolders,
                        keywords: ['spaces', 'folders'],
                        children: [],
                        exact: true,
                    },
                );
            }

            if (
                isExternalSourcesEnabled &&
                ability?.can(
                    'manage',
                    subject('ExternalSource', {
                        organizationUuid: organization.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectItems.push({
                    label: t('useSettingsNavigation.externalSources'),
                    to: `${base}/externalSources`,
                    icon: IconDatabaseExport,
                    keywords: ['csv', 'upload', 'files', 'google sheets'],
                    children: [],
                    exact: true,
                });
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
                    label: t('useSettingsNavigation.usageAnalytics'),
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
                label: t('useSettingsNavigation.syncsScheduledDeliveries'),
                to: `${base}/scheduledDeliveries`,
                icon: IconCalendarStats,
                keywords: ['email', 'reports', 'sync', 'dbt'],
                children: [],
                exact: true,
            });

            if (
                isDataAppsEnabled &&
                ability?.can(
                    'manage',
                    subject('ExternalConnection', {
                        organizationUuid: organization.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectItems.push({
                    label: t('useSettingsNavigation.dataAppConnections'),
                    to: `${base}/dataAppConnections`,
                    icon: IconPlugConnected,
                    keywords: ['external', 'api', 'http', 'fetch', 'apps'],
                    children: [],
                    exact: true,
                });
            }

            if (organization?.pgWire?.enabled) {
                projectItems.push({
                    label: t('useSettingsNavigation.metricSqlApi'),
                    to: `${base}/semanticLayer`,
                    icon: IconPlug,
                    keywords: [
                        'postgres',
                        'pgwire',
                        'connection',
                        'sql',
                        'bi',
                        'metric',
                        'semantic layer',
                    ],
                    children: [],
                    exact: true,
                });
            }

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
                const embedChildren: SettingsNavigationItem[] = [
                    {
                        label: t('useSettingsNavigation.general'),
                        to: `${base}/embed`,
                        icon: IconBrowser,
                        keywords: ['embed', 'iframe', 'public'],
                        children: [],
                        exact: true,
                    },
                ];

                if (ability?.can('manage', 'Organization')) {
                    embedChildren.push({
                        label: t('useSettingsNavigation.cors'),
                        to: `${base}/embed/cors`,
                        icon: IconWorldCog,
                        keywords: ['cors', 'origins', 'domains', 'embed'],
                        children: [],
                        exact: true,
                    });
                }

                projectItems.push({
                    label: t('useSettingsNavigation.embedConfiguration'),
                    to: `${base}/embed`,
                    icon: IconBrowser,
                    keywords: ['embed', 'iframe', 'public'],
                    children: embedChildren,
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
                projectItems.push(limitedItems.validator);
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
                    label: t('useSettingsNavigation.verifiedContent'),
                    to: `${base}/verifiedContent`,
                    icon: IconShieldCheck,
                    keywords: ['certified', 'trusted'],
                    children: [],
                    exact: true,
                });
            }

            if (
                isContentReviewAvailable &&
                ability?.can(
                    'manage',
                    subject('Project', {
                        organizationUuid: project.organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                )
            ) {
                projectItems.push({
                    label: t('useSettingsNavigation.reviewRequests'),
                    to: `${base}/reviewRequests`,
                    icon: IconSend,
                    keywords: [
                        'review',
                        'personal space',
                        'approve',
                        'reviewers',
                    ],
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
                    label: t('useSettingsNavigation.dataOps'),
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
                    label: t('useSettingsNavigation.pullRequests'),
                    to: `${base}/pullRequests`,
                    icon: IconGitPullRequest,
                    keywords: ['git', 'github', 'write back'],
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
                    label: t('useSettingsNavigation.contentReview'),
                    to: `${base}/contentReview`,
                    icon: IconEyeCheck,
                    keywords: ['drafts', 'unpublished', 'review', 'write back'],
                    children: [],
                    exact: true,
                });
            }

            if (health?.softDelete?.enabled) {
                projectItems.push(limitedItems.recentlyDeleted);
            }

            sections.push({
                id: 'current-project',
                title: t('useSettingsNavigation.currentProject'),
                subtitle: project.name,
                items: projectItems,
            });
        }

        return sections;
    }, [
        t,
        user?.ability,
        organization,
        project,
        health,
        allowPasswordAuthentication,
        hasSocialLogin,
        isGroupManagementEnabled,
        isProLimitsEnabled,
        canAccessAnalyticsSettings,
        isOrganizationRoadmapEnabled,
        canAccessAiCredits,
        isCustomRolesEnabled,
        isSsoOrganizationSettingsEnabled,
        isEmailWhitelabelEnabled,
        isWarehouseCredentialsEnabled,
        showMyAgentConnections,
        isAgentIdentityEnabled,
        isScimEnabled,
        isServiceAccountsEnabled,
        isAiCopilotEnabledOrTrial,
        shouldShowAiAgentReviews,
        canManageOrgAiAgent,
        hasAnyAiAgentAccess,
        isEmbeddingEnabled,
        isDataAppsEnabled,
        isDataAppAnalysisEnabled,
        isDataAppGeneralSettingsEnabled,
        isExternalSourcesEnabled,
        isResultsCacheEnabled,
        isGitProject,
        isContentReviewAvailable,
        projectSettingsAccess,
        track,
    ]);
};
