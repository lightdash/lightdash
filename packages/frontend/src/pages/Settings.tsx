import { subject } from '@casl/ability';
import { CommercialFeatureFlags, FeatureFlags } from '@lightdash/common';
import {
    Anchor,
    ActionIcon,
    Box,
    Group,
    ScrollArea,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
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
    IconGitPullRequest,
    IconGauge,
    IconHistory,
    IconIdBadge2,
    IconKey,
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
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
import { useState, useMemo, type FC } from 'react';
import {
    matchPath,
    Navigate,
    useLocation,
    useRoutes,
    type RouteObject,
} from 'react-router';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import RouterNavLink from '../components/common/RouterNavLink';
import { SettingsGridCard } from '../components/common/Settings/SettingsCard';
import { useIsGitProject } from '../components/Explorer/WriteBackModal/hooks';
import PageSpinner from '../components/PageSpinner';
import AccessTokensPanel from '../components/UserSettings/AccessTokensPanel';
import AllowedDomainsPanel from '../components/UserSettings/AllowedDomainsPanel';
import AppearanceSettingsPanel from '../components/UserSettings/AppearanceSettingsPanel';
import DefaultProjectPanel from '../components/UserSettings/DefaultProjectPanel';
import { DeleteOrganizationPanel } from '../components/UserSettings/DeleteOrganizationPanel';
import ExportingPanel from '../components/UserSettings/ExportingPanel';
import GithubSettingsPanel from '../components/UserSettings/GithubSettingsPanel';
import GitlabSettingsPanel from '../components/UserSettings/GitlabSettingsPanel';
import ImpersonationPanel from '../components/UserSettings/ImpersonationPanel';
import { LeaveOrganizationPanel } from '../components/UserSettings/LeaveOrganizationPanel';
import LimitsPanel from '../components/UserSettings/LimitsPanel';
import MyAppsPanel from '../components/UserSettings/MyAppsPanel';
import { MyWarehouseConnectionsPanel } from '../components/UserSettings/MyWarehouseConnectionsPanel';
import OAuthClientsPanel from '../components/UserSettings/OAuthClientsPanel';
import OrganizationPanel from '../components/UserSettings/OrganizationPanel';
import AccountLinkingPanel from '../components/UserSettings/OrganizationSso/AccountLinkingPanel';
import AzureAdSsoPanel from '../components/UserSettings/OrganizationSso/AzureAdSsoPanel';
import GenericOidcSsoPanel from '../components/UserSettings/OrganizationSso/GenericOidcSsoPanel';
import GoogleSsoPanel from '../components/UserSettings/OrganizationSso/GoogleSsoPanel';
import OktaSsoPanel from '../components/UserSettings/OrganizationSso/OktaSsoPanel';
import OneLoginSsoPanel from '../components/UserSettings/OrganizationSso/OneLoginSsoPanel';
import { OrganizationWarehouseCredentialsPanel } from '../components/UserSettings/OrganizationWarehouseCredentialsPanel';
import PasswordPanel from '../components/UserSettings/PasswordPanel';
import ProfilePanel from '../components/UserSettings/ProfilePanel';
import ProjectManagementPanel from '../components/UserSettings/ProjectManagementPanel';
import UserScheduledDeliveriesPanel from '../components/UserSettings/ScheduledDeliveriesPanel';
import SlackSettingsPanel from '../components/UserSettings/SlackSettingsPanel';
import SocialLoginsPanel from '../components/UserSettings/SocialLoginsPanel';
import SupportImpersonationPanel from '../components/UserSettings/SupportImpersonationPanel';
import UserAttributesPanel from '../components/UserSettings/UserAttributesPanel';
import UsersAndGroupsPanel from '../components/UserSettings/UsersAndGroupsPanel';
import VerifiedDomainsPanel from '../components/UserSettings/VerifiedDomains/VerifiedDomainsPanel';
import { AiAgentsSettingsPage } from '../ee/features/aiCopilot/components/Admin/settings/AiAgentsSettingsPage';
import { AiGeneralSettingsPage } from '../ee/features/aiCopilot/components/Admin/settings/AiGeneralSettingsPage';
import { AiReviewsSettingsPage } from '../ee/features/aiCopilot/components/Admin/settings/AiReviewsSettingsPage';
import { AiSettingsProviders } from '../ee/features/aiCopilot/components/Admin/settings/AiSettingsProviders';
import { AiThreadsSettingsPage } from '../ee/features/aiCopilot/components/Admin/settings/AiThreadsSettingsPage';
import { useAiOrganizationSettings } from '../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import ScimAccessTokensPanel from '../ee/features/scim/components/ScimAccessTokensPanel';
import { ServiceAccountsPage } from '../ee/features/serviceAccounts';
import { CustomRoleCreate } from '../ee/pages/customRoles/CustomRoleCreate';
import { CustomRoleEdit } from '../ee/pages/customRoles/CustomRoleEdit';
import { CustomRoles } from '../ee/pages/customRoles/CustomRoles';
import DesignListPage from '../features/organizationDesigns/components/DesignListPage';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import { useProject } from '../hooks/useProject';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import useTracking from '../providers/Tracking/useTracking';
import { EventName, PageName } from '../types/Events';
import ProjectSettings from './ProjectSettings';
import classes from './Settings.module.css';

const Settings: FC = () => {
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

    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const { track } = useTracking();
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

    const routes = useMemo<RouteObject[]>(() => {
        const allowedRoutes: RouteObject[] = [
            {
                path: '/appearance',
                element: <AppearanceSettingsPanel />,
            },
            {
                path: '/profile',
                element: (
                    <Stack gap="xl">
                        <SettingsGridCard>
                            <Title order={4}>Profile settings</Title>
                            <ProfilePanel />
                        </SettingsGridCard>
                        {isLeaveOrganizationEnabled && (
                            <SettingsGridCard>
                                <Box>
                                    <Title order={4}>Danger zone</Title>
                                    <Text c="ldGray.6" fz="xs">
                                        Leave the organization to remove
                                        yourself from it (you cannot leave if
                                        you are the only admin). This action is
                                        not reversible.
                                    </Text>
                                </Box>
                                <LeaveOrganizationPanel />
                            </SettingsGridCard>
                        )}
                    </Stack>
                ),
            },
            {
                path: '*',
                element: <Navigate to="/generalSettings/profile" />,
            },
        ];

        if (allowPasswordAuthentication) {
            allowedRoutes.push({
                path: '/password',
                element: (
                    <Stack gap="xl">
                        <SettingsGridCard>
                            <Title order={4}>Password settings</Title>
                            <PasswordPanel />
                        </SettingsGridCard>

                        {hasSocialLogin && (
                            <SettingsGridCard>
                                <Title order={4}>Social logins</Title>
                                <SocialLoginsPanel />
                            </SettingsGridCard>
                        )}
                    </Stack>
                ),
            });
        }
        allowedRoutes.push({
            path: '/myWarehouseConnections',
            element: (
                <Stack gap="xl">
                    <MyWarehouseConnectionsPanel />
                </Stack>
            ),
        });
        if (user?.ability.can('create', 'ScheduledDeliveries')) {
            // A user might not be able to create scheduled permissions on the org level but on a specific project
            // level. The check here makes sure that the user has the ability to create a scheduled delivery at least somewhere.
            // Since the service returns specifically the user's scheduled deliveries, this is completely intended behavior.
            allowedRoutes.push({
                path: '/userScheduledDeliveries',
                element: (
                    <Stack gap="xl">
                        <SettingsGridCard>
                            <Title order={4}>My scheduled deliveries</Title>
                        </SettingsGridCard>
                        <UserScheduledDeliveriesPanel />
                    </Stack>
                ),
            });
        }
        if (dataAppsFlag?.enabled && user?.ability.can('create', 'DataApp')) {
            allowedRoutes.push({
                path: '/myApps',
                element: (
                    <Stack gap="xl">
                        <SettingsGridCard>
                            <Title order={4}>My apps</Title>
                        </SettingsGridCard>
                        <MyAppsPanel />
                    </Stack>
                ),
            });
        }
        if (user?.ability.can('manage', 'PersonalAccessToken')) {
            allowedRoutes.push({
                path: '/organization',
                element: (
                    <Stack gap="xl">
                        <SettingsGridCard>
                            <Title order={4}>General</Title>
                            <OrganizationPanel />
                        </SettingsGridCard>

                        <SettingsGridCard>
                            <div>
                                <Title order={4}>Allowed email domains</Title>
                                <Text c="ldGray.6" fz="xs">
                                    Anyone with email addresses at these domains
                                    can automatically join the organization.
                                </Text>
                            </div>
                            <AllowedDomainsPanel />
                        </SettingsGridCard>

                        <SettingsGridCard>
                            <div>
                                <Title order={4}>Default Project</Title>
                                <Text c="ldGray.6" fz="xs">
                                    This is the project users will see when they
                                    log in for the first time or from a new
                                    device. If a user does not have access, they
                                    will see their next accessible project.
                                </Text>
                            </div>
                            <DefaultProjectPanel />
                        </SettingsGridCard>

                        {showImpersonationPanel && (
                            <SettingsGridCard>
                                <Title order={4}>User impersonation</Title>
                                <ImpersonationPanel />
                            </SettingsGridCard>
                        )}

                        <SettingsGridCard>
                            <Title order={4}>Lightdash support access</Title>
                            <SupportImpersonationPanel />
                        </SettingsGridCard>

                        {(isLeaveOrganizationEnabled ||
                            user.ability?.can('delete', 'Organization')) && (
                            <SettingsGridCard>
                                <div>
                                    <Title order={4}>Danger zone </Title>
                                    <Text c="ldGray.6" fz="xs">
                                        {isLeaveOrganizationEnabled &&
                                            'Leave the organization to remove yourself from it (you cannot leave if you are the only admin). '}
                                        {user.ability?.can(
                                            'delete',
                                            'Organization',
                                        ) &&
                                            'Deleting the organization removes the whole workspace and all its content, including users. '}
                                        These actions are not reversible.
                                    </Text>
                                </div>
                                <Stack gap="sm" align="flex-end">
                                    {isLeaveOrganizationEnabled && (
                                        <LeaveOrganizationPanel />
                                    )}
                                    {user.ability?.can(
                                        'delete',
                                        'Organization',
                                    ) && <DeleteOrganizationPanel />}
                                </Stack>
                            </SettingsGridCard>
                        )}
                    </Stack>
                ),
            });
        }
        if (user?.ability.can('manage', 'Organization')) {
            allowedRoutes.push({
                path: '/exporting',
                element: (
                    <Stack gap="xl">
                        <SettingsGridCard>
                            <div>
                                <Title order={4}>Scheduled deliveries</Title>
                                <Text c="ldGray.6" fz="xs">
                                    Control how files exported from your
                                    organization — starting with scheduled
                                    deliveries — are shared.{' '}
                                    <Anchor
                                        inherit
                                        href="https://docs.lightdash.com/guides/how-to-create-scheduled-deliveries"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Learn more about scheduled deliveries
                                    </Anchor>
                                    .
                                </Text>
                            </div>
                            <ExportingPanel />
                        </SettingsGridCard>
                    </Stack>
                ),
            });
        }
        if (isProLimitsEnabled && user?.ability.can('manage', 'Organization')) {
            allowedRoutes.push({
                path: '/limits',
                element: (
                    <Stack gap="xl">
                        <SettingsGridCard>
                            <div>
                                <Title order={4}>Limits</Title>
                                <Text c="ldGray.6" fz="xs">
                                    Limit how many rows a query can return and
                                    how many cells a CSV or Excel export can
                                    contain for your organization.
                                </Text>
                            </div>
                            <LimitsPanel />
                        </SettingsGridCard>
                    </Stack>
                ),
            });
        }
        if (
            user?.ability.can(
                'manage',
                subject('OrganizationMemberProfile', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/userManagement',
                element: <UsersAndGroupsPanel />,
            });
        }

        if (
            user?.ability.can(
                'manage',
                subject('Organization', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/userAttributes',
                element: <UserAttributesPanel />,
            });
        }
        if (
            user?.ability.can(
                'manage',
                subject('OrganizationWarehouseCredentials', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/warehouseCredentials',
                element: <OrganizationWarehouseCredentialsPanel />,
            });
        }
        if (
            organization &&
            !organization.needsProject &&
            user?.ability.can('view', 'Project')
        ) {
            allowedRoutes.push({
                path: '/projectManagement',
                element: <ProjectManagementPanel />,
            });
        }

        if (
            project &&
            organization &&
            !organization.needsProject &&
            user?.ability.can(
                'update',
                subject('Project', {
                    organizationUuid: organization.organizationUuid,
                    projectUuid: project.projectUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/projectManagement/:projectUuid/*',
                element: (
                    <TrackPage name={PageName.PROJECT_SETTINGS}>
                        <ProjectSettings />
                    </TrackPage>
                ),
            });
        }
        if (user?.ability.can('manage', 'PersonalAccessToken')) {
            allowedRoutes.push({
                path: '/personalAccessTokens',
                element: <AccessTokensPanel />,
            });
        }

        if (
            dataAppsFlag?.enabled &&
            user?.ability.can('view', 'OrganizationDesign')
        ) {
            allowedRoutes.push({
                path: '/themes',
                element: <DesignListPage />,
            });
        }

        if (user?.ability.can('manage', 'Organization')) {
            allowedRoutes.push({
                path: '/integrations',
                element: (
                    <Stack>
                        <Title order={4}>Integrations</Title>
                        {!health?.hasSlack &&
                            !health?.hasGithub &&
                            !health?.hasGitlab &&
                            'No integrations available'}
                        {health?.hasSlack && <SlackSettingsPanel />}
                        {health?.hasGithub && <GithubSettingsPanel />}
                        {health?.hasGitlab && <GitlabSettingsPanel />}
                    </Stack>
                ),
            });
        }

        if (user?.ability.can('manage', 'Organization')) {
            allowedRoutes.push({
                path: '/oauthClients',
                element: <OAuthClientsPanel />,
            });
        }

        if (
            user?.ability.can('manage', 'Organization') &&
            isSsoOrganizationSettingsEnabled
        ) {
            allowedRoutes.push({
                path: '/verifiedDomains',
                element: <VerifiedDomainsPanel />,
            });
        }

        if (
            user?.ability.can('manage', 'Organization') &&
            isSsoOrganizationSettingsEnabled
        ) {
            allowedRoutes.push({
                path: '/sso',
                element: (
                    <Stack gap="md">
                        <Stack gap="xs">
                            <Title order={5}>Single Sign-On</Title>
                            <Text c="ldGray.6" fz="xs">
                                Configure SSO providers for your organization.
                                Users are routed to the matching provider based
                                on their email domain.
                            </Text>
                        </Stack>
                        <AzureAdSsoPanel />
                        <OktaSsoPanel />
                        <GenericOidcSsoPanel />
                        <OneLoginSsoPanel />
                        {/* Google has no per-org credentials; only show the
                            toggle when Google is enabled instance-wide. */}
                        {health?.auth.google.enabled && <GoogleSsoPanel />}
                        <AccountLinkingPanel />
                    </Stack>
                ),
            });
        }

        // Commercial route
        if (
            user?.ability.can('manage', 'Organization') &&
            isScimTokenManagementEnabled?.enabled
        ) {
            allowedRoutes.push({
                path: '/scimAccessTokens',
                element: <ScimAccessTokensPanel />,
            });
        }

        if (
            user?.ability.can('manage', 'Organization') &&
            isServiceAccountsEnabled
        ) {
            allowedRoutes.push({
                path: '/serviceAccounts',
                element: <ServiceAccountsPage />,
            });
        }

        if (
            isAiCopilotEnabledOrTrial &&
            user?.ability.can(
                'manage',
                subject('AiAgent', {
                    organizationUuid: organization?.organizationUuid,
                }),
            )
        ) {
            allowedRoutes.push({
                path: '/ai',
                element: <Navigate to="/generalSettings/ai/general" replace />,
            });
            allowedRoutes.push({
                path: '/ai/general',
                element: <AiGeneralSettingsPage />,
            });
            allowedRoutes.push({
                path: '/ai/threads',
                element: (
                    <AiSettingsProviders>
                        <AiThreadsSettingsPage />
                    </AiSettingsProviders>
                ),
            });
            allowedRoutes.push({
                path: '/ai/agents',
                element: (
                    <AiSettingsProviders>
                        <AiAgentsSettingsPage />
                    </AiSettingsProviders>
                ),
            });
            if (shouldShowAiAgentReviews) {
                allowedRoutes.push({
                    path: '/ai/reviews',
                    element: (
                        <AiSettingsProviders>
                            <AiReviewsSettingsPage />
                        </AiSettingsProviders>
                    ),
                });
            }
        }

        if (
            user?.ability.can('manage', 'Organization') &&
            isCustomRolesEnabled
        ) {
            allowedRoutes.push({
                path: '/customRoles',
                element: <CustomRoles />,
            });
            allowedRoutes.push({
                path: '/customRoles/create',
                element: <CustomRoleCreate />,
            });
            allowedRoutes.push({
                path: '/customRoles/:roleId',
                element: <CustomRoleEdit />,
            });
        }

        return allowedRoutes;
    }, [
        allowPasswordAuthentication,
        user?.ability,
        organization,
        project,
        isScimTokenManagementEnabled?.enabled,
        isServiceAccountsEnabled,
        isCustomRolesEnabled,
        hasSocialLogin,
        showImpersonationPanel,
        health?.hasSlack,
        health?.hasGithub,
        health?.hasGitlab,
        health?.auth.google.enabled,
        dataAppsFlag?.enabled,
        isProLimitsEnabled,
        isSsoOrganizationSettingsEnabled,
        isLeaveOrganizationEnabled,
        isAiCopilotEnabledOrTrial,
        shouldShowAiAgentReviews,
    ]);
    const routeElements = useRoutes(routes);

    const location = useLocation();
    const isFixedContent = useMemo(() => {
        return (
            !matchPath(
                {
                    path: '/generalSettings/projectManagement',
                    end: true,
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/projectManagement/:projectUuid/changesets',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/projectManagement/:projectUuid/scheduledDeliveries',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/userScheduledDeliveries',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/myApps',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/projectManagement/:projectUuid/compilationHistory',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/projectManagement/:projectUuid/recentlyDeleted',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/customRoles',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/customRoles/:roleId',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/serviceAccounts',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/projectManagement/:projectUuid/preAggregates/*',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/projectManagement/:projectUuid/validator',
                },
                location.pathname,
            ) &&
            !matchPath(
                {
                    path: '/generalSettings/projectManagement/:projectUuid/pullRequests',
                },
                location.pathname,
            ) &&
            !matchPath(
                { path: '/generalSettings/ai/threads' },
                location.pathname,
            ) &&
            !matchPath(
                { path: '/generalSettings/ai/agents' },
                location.pathname,
            ) &&
            !matchPath(
                { path: '/generalSettings/ai/reviews' },
                location.pathname,
            )
        );
    }, [location.pathname]);

    if (
        isHealthLoading ||
        isUserLoading ||
        isOrganizationLoading ||
        isActiveProjectUuidLoading ||
        isProjectLoading
    ) {
        return <PageSpinner />;
    }

    if (userError || healthError || organizationError || projectError) {
        return (
            <ErrorState
                error={
                    userError?.error ||
                    healthError?.error ||
                    organizationError?.error ||
                    projectError?.error
                }
            />
        );
    }

    if (!health || !user || !organization) return null;

    return (
        <Page
            withFullHeight
            withSidebarFooter
            withFixedContent={isFixedContent}
            withPaddedContent
            title="Settings"
            sidebarWidthProps={{ defaultWidth: 300, minWidth: 260 }}
            isSidebarCollapsed={isSidebarCollapsed}
            isSidebarCollapsible
            collapsedSidebarContent={
                <Tooltip label="Pin sidebar" position="right" variant="xs">
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="lg"
                        onClick={() => setIsSidebarCollapsed(false)}
                        aria-label="Pin sidebar"
                    >
                        <MantineIcon icon={IconLayoutSidebarLeftExpand} />
                    </ActionIcon>
                </Tooltip>
            }
            sidebar={
                <Stack className={classes.sidebarStack}>
                    <Group
                        justify="space-between"
                        align="center"
                        className={classes.sidebarHeader}
                    >
                        <PageBreadcrumbs
                            items={[{ title: 'Settings', active: true }]}
                        />
                        <Tooltip
                            label={
                                isSidebarCollapsed
                                    ? 'Pin sidebar'
                                    : 'Unpin sidebar'
                            }
                            variant="xs"
                        >
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="lg"
                                onClick={() =>
                                    setIsSidebarCollapsed(
                                        (collapsed) => !collapsed,
                                    )
                                }
                                aria-label={
                                    isSidebarCollapsed
                                        ? 'Pin sidebar'
                                        : 'Unpin sidebar'
                                }
                            >
                                <MantineIcon
                                    icon={
                                        isSidebarCollapsed
                                            ? IconLayoutSidebarLeftExpand
                                            : IconLayoutSidebarLeftCollapse
                                    }
                                />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                    <ScrollArea
                        type="scroll"
                        scrollbarSize={8}
                        scrollHideDelay={800}
                        className={classes.sidebarScroll}
                    >
                        <Stack gap="lg">
                            <Box>
                                <Title order={6} fw={600} mb="xs">
                                    Your settings
                                </Title>
                                <RouterNavLink
                                    exact
                                    to="/generalSettings/profile"
                                    label="Profile"
                                    leftSection={
                                        <MantineIcon icon={IconUserCircle} />
                                    }
                                />
                                {allowPasswordAuthentication && (
                                    <RouterNavLink
                                        label={
                                            hasSocialLogin
                                                ? 'Password & Social Logins'
                                                : 'Password'
                                        }
                                        exact
                                        to="/generalSettings/password"
                                        leftSection={
                                            <MantineIcon icon={IconLock} />
                                        }
                                    />
                                )}
                                <RouterNavLink
                                    label="My warehouse connections"
                                    exact
                                    to="/generalSettings/myWarehouseConnections"
                                    leftSection={
                                        <MantineIcon icon={IconDatabaseCog} />
                                    }
                                />
                                {/*A user might not be able to create scheduled
                                permissions on the org level but on a specific
                                project level. The check here makes sure that
                                the user has the ability to create a scheduled
                                delivery at least somewhere. Since the
                                service returns specifically the user's
                                scheduled deliveries, this is completely
                                intended behavior.*/}
                                {user.ability.can(
                                    'create',
                                    'ScheduledDeliveries',
                                ) && (
                                    <RouterNavLink
                                        label="My scheduled deliveries"
                                        exact
                                        to="/generalSettings/userScheduledDeliveries"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconCalendarStats}
                                            />
                                        }
                                    />
                                )}
                                {dataAppsFlag?.enabled &&
                                    user.ability.can('create', 'DataApp') && (
                                        <RouterNavLink
                                            label="My apps"
                                            exact
                                            to="/generalSettings/myApps"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconAppWindow}
                                                />
                                            }
                                        />
                                    )}
                                {user.ability.can(
                                    'manage',
                                    'PersonalAccessToken',
                                ) && (
                                    <RouterNavLink
                                        label="Personal access tokens"
                                        exact
                                        to="/generalSettings/personalAccessTokens"
                                        leftSection={
                                            <MantineIcon icon={IconKey} />
                                        }
                                    />
                                )}
                            </Box>

                            <Box>
                                <Title order={6} fw={600} mb="xs">
                                    Organization settings
                                </Title>

                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label="General"
                                        to="/generalSettings/organization"
                                        exact
                                        leftSection={
                                            <MantineIcon
                                                icon={IconBuildingSkyscraper}
                                            />
                                        }
                                    />
                                )}
                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label="Exporting"
                                        to="/generalSettings/exporting"
                                        exact
                                        leftSection={
                                            <MantineIcon
                                                icon={IconFileExport}
                                            />
                                        }
                                    />
                                )}
                                {isProLimitsEnabled &&
                                    user.ability.can(
                                        'manage',
                                        'Organization',
                                    ) && (
                                        <RouterNavLink
                                            label="Limits"
                                            to="/generalSettings/limits"
                                            exact
                                            leftSection={
                                                <MantineIcon icon={IconGauge} />
                                            }
                                        />
                                    )}
                                {isCustomRolesEnabled && (
                                    <Can I="manage" a="Organization">
                                        <RouterNavLink
                                            label="Custom roles"
                                            to="/generalSettings/customRoles"
                                            exact
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconIdBadge2}
                                                />
                                            }
                                        />
                                    </Can>
                                )}

                                {user.ability.can(
                                    'update',
                                    'OrganizationMemberProfile',
                                ) && (
                                    <RouterNavLink
                                        label={
                                            isGroupManagementEnabled
                                                ? 'Users & groups'
                                                : 'User management'
                                        }
                                        to="/generalSettings/userManagement"
                                        exact
                                        leftSection={
                                            <MantineIcon icon={IconUserPlus} />
                                        }
                                    />
                                )}
                                {user.ability.can(
                                    'manage',
                                    subject('Organization', {
                                        organizationUuid:
                                            organization.organizationUuid,
                                    }),
                                ) && (
                                    <RouterNavLink
                                        label={
                                            isGroupManagementEnabled
                                                ? 'User & group attributes'
                                                : 'User attributes'
                                        }
                                        to="/generalSettings/userAttributes"
                                        exact
                                        leftSection={
                                            <MantineIcon
                                                icon={IconUserShield}
                                            />
                                        }
                                    />
                                )}

                                {user.ability.can('update', 'Organization') && (
                                    <RouterNavLink
                                        label="Appearance"
                                        exact
                                        to="/generalSettings/appearance"
                                        leftSection={
                                            <MantineIcon icon={IconPalette} />
                                        }
                                    />
                                )}

                                {dataAppsFlag?.enabled &&
                                    user.ability.can(
                                        'view',
                                        'OrganizationDesign',
                                    ) && (
                                        <RouterNavLink
                                            label="Themes"
                                            exact
                                            to="/generalSettings/themes"
                                            leftSection={
                                                <MantineIcon icon={IconBrush} />
                                            }
                                        />
                                    )}

                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label="Integrations"
                                        exact
                                        to="/generalSettings/integrations"
                                        leftSection={
                                            <MantineIcon icon={IconPlug} />
                                        }
                                    />
                                )}

                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label="OAuth applications"
                                        exact
                                        to="/generalSettings/oauthClients"
                                        leftSection={
                                            <MantineIcon icon={IconApps} />
                                        }
                                    />
                                )}

                                {user.ability.can('manage', 'Organization') &&
                                    isSsoOrganizationSettingsEnabled && (
                                        <RouterNavLink
                                            label="Verified domains"
                                            exact
                                            to="/generalSettings/verifiedDomains"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconWorldCheck}
                                                />
                                            }
                                        />
                                    )}

                                {user.ability.can('manage', 'Organization') &&
                                    isSsoOrganizationSettingsEnabled && (
                                        <RouterNavLink
                                            label="Single Sign-On"
                                            exact
                                            to="/generalSettings/sso"
                                            leftSection={
                                                <MantineIcon icon={IconLock} />
                                            }
                                        />
                                    )}

                                {user.ability.can(
                                    'manage',
                                    subject(
                                        'OrganizationWarehouseCredentials',
                                        {
                                            organizationUuid:
                                                organization?.organizationUuid,
                                        },
                                    ),
                                ) &&
                                    isWarehouseCredentialsEnabled && (
                                        <RouterNavLink
                                            label="Warehouse credentials"
                                            exact
                                            to="/generalSettings/warehouseCredentials"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconDatabaseCog}
                                                />
                                            }
                                        />
                                    )}

                                {organization &&
                                    !organization.needsProject &&
                                    user.ability.can('view', 'Project') && (
                                        <RouterNavLink
                                            label="All projects"
                                            to="/generalSettings/projectManagement"
                                            exact
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconDatabase}
                                                />
                                            }
                                        />
                                    )}

                                {user.ability.can('manage', 'Organization') &&
                                    isScimTokenManagementEnabled?.enabled && (
                                        <RouterNavLink
                                            label="SCIM access tokens"
                                            exact
                                            to="/generalSettings/scimAccessTokens"
                                            leftSection={
                                                <MantineIcon icon={IconKey} />
                                            }
                                        />
                                    )}
                                {user.ability.can('manage', 'Organization') &&
                                    isServiceAccountsEnabled && (
                                        <RouterNavLink
                                            label="Service accounts"
                                            exact
                                            to="/generalSettings/serviceAccounts"
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconUserCode}
                                                />
                                            }
                                        />
                                    )}
                                {isAiCopilotEnabledOrTrial &&
                                    user.ability.can(
                                        'manage',
                                        subject('AiAgent', {
                                            organizationUuid:
                                                organization.organizationUuid,
                                        }),
                                    ) && (
                                        <RouterNavLink
                                            label="Ask AI"
                                            to="/generalSettings/ai"
                                            leftSection={
                                                <MantineIcon icon={IconBrain} />
                                            }
                                            defaultOpened={location.pathname.includes(
                                                '/generalSettings/ai',
                                            )}
                                        >
                                            <RouterNavLink
                                                label="General"
                                                exact
                                                to="/generalSettings/ai/general"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconSettings}
                                                    />
                                                }
                                            />
                                            <RouterNavLink
                                                label="Threads"
                                                exact
                                                to="/generalSettings/ai/threads"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconMessageCircle}
                                                    />
                                                }
                                            />
                                            <RouterNavLink
                                                label="Agents"
                                                exact
                                                to="/generalSettings/ai/agents"
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconRobotFace}
                                                    />
                                                }
                                            />
                                            {shouldShowAiAgentReviews && (
                                                <RouterNavLink
                                                    label="Reviews"
                                                    exact
                                                    to="/generalSettings/ai/reviews"
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconListCheck}
                                                        />
                                                    }
                                                />
                                            )}
                                        </RouterNavLink>
                                    )}
                            </Box>

                            {organization &&
                            !organization.needsProject &&
                            project &&
                            user.ability.can(
                                'update',
                                subject('Project', {
                                    organizationUuid:
                                        organization.organizationUuid,
                                    projectUuid: project.projectUuid,
                                }),
                            ) ? (
                                <Box>
                                    <Box mb="xs">
                                        <Title order={6} fw={600}>
                                            Current project
                                        </Title>
                                        <Text fz="sm" fw={700} mt={2}>
                                            {project?.name}
                                        </Text>
                                    </Box>

                                    <RouterNavLink
                                        label="Connection settings"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/settings`}
                                        leftSection={
                                            <MantineIcon
                                                icon={IconDatabaseCog}
                                            />
                                        }
                                    />

                                    <RouterNavLink
                                        label="Tables configuration"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/tablesConfiguration`}
                                        leftSection={
                                            <MantineIcon
                                                icon={IconTableOptions}
                                            />
                                        }
                                    />

                                    <RouterNavLink
                                        label="Changesets"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/changesets`}
                                        leftSection={
                                            <MantineIcon icon={IconHistory} />
                                        }
                                    />

                                    <RouterNavLink
                                        label="Compilation history"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/compilationHistory`}
                                        leftSection={
                                            <MantineIcon icon={IconRefresh} />
                                        }
                                    />

                                    {/* TODO: Consider adding a setting to disable pre-aggregate materializations on preview projects,
                                        or turn them off by default. Currently materializations still run on previews,
                                        which can be resource-intensive. Admins/developers should be able to control this. */}
                                    {health.preAggregates.enabled && (
                                        <RouterNavLink
                                            label="Pre-aggregates"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/preAggregates`}
                                            leftSection={
                                                <MantineIcon icon={IconBolt} />
                                            }
                                            defaultOpened={location.pathname.includes(
                                                `/projectManagement/${project.projectUuid}/preAggregates`,
                                            )}
                                        >
                                            <RouterNavLink
                                                label="Materializations"
                                                exact
                                                to={`/generalSettings/projectManagement/${project.projectUuid}/preAggregates/materializations`}
                                                leftSection={
                                                    <MantineIcon
                                                        icon={IconDatabase}
                                                    />
                                                }
                                            />
                                            <RouterNavLink
                                                label="Analytics"
                                                exact
                                                to={`/generalSettings/projectManagement/${project.projectUuid}/preAggregates/audit`}
                                                leftSection={
                                                    <MantineIcon
                                                        icon={
                                                            IconReportAnalytics
                                                        }
                                                    />
                                                }
                                            />
                                        </RouterNavLink>
                                    )}

                                    <RouterNavLink
                                        label="Parameters"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/parameters`}
                                        leftSection={
                                            <MantineIcon icon={IconVariable} />
                                        }
                                    />

                                    <Can
                                        I="update"
                                        this={subject('Project', {
                                            organizationUuid:
                                                organization.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        })}
                                    >
                                        <RouterNavLink
                                            label="Project time zone"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/queryTimezone`}
                                            leftSection={
                                                <MantineIcon icon={IconClock} />
                                            }
                                        />
                                    </Can>

                                    <Can
                                        I="update"
                                        this={subject('Project', {
                                            organizationUuid:
                                                organization.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        })}
                                    >
                                        <RouterNavLink
                                            label="Preview settings"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/previewsConfig`}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconUserCode}
                                                />
                                            }
                                        />
                                    </Can>

                                    <Can
                                        I="update"
                                        this={subject('Project', {
                                            organizationUuid:
                                                organization.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        })}
                                    >
                                        <RouterNavLink
                                            label="Appearance"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/appearance`}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconPalette}
                                                />
                                            }
                                        />
                                    </Can>

                                    <Can
                                        I="manage"
                                        this={subject('Project', {
                                            organizationUuid:
                                                organization.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        })}
                                    >
                                        <RouterNavLink
                                            label="Project access"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/projectAccess`}
                                            leftSection={
                                                <MantineIcon icon={IconUsers} />
                                            }
                                        />
                                        <RouterNavLink
                                            label="Default user spaces"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/defaultUserSpaces`}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconFolders}
                                                />
                                            }
                                        />
                                    </Can>

                                    {user.ability.can(
                                        'view',
                                        subject('Analytics', {
                                            organizationUuid:
                                                organization.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label="Usage analytics"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/usageAnalytics`}
                                            onClick={() => {
                                                track({
                                                    name: EventName.USAGE_ANALYTICS_CLICKED,
                                                });
                                            }}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconReportAnalytics}
                                                />
                                            }
                                        />
                                    ) : null}

                                    <RouterNavLink
                                        label="Syncs & Scheduled deliveries"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/scheduledDeliveries`}
                                        leftSection={
                                            <MantineIcon
                                                icon={IconCalendarStats}
                                            />
                                        }
                                    />

                                    {user.ability?.can(
                                        'update',
                                        subject('Project', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) && embeddingEnabled?.enabled ? (
                                        <RouterNavLink
                                            label="Embed configuration"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/embed`}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconBrowser}
                                                />
                                            }
                                        />
                                    ) : null}

                                    {user.ability?.can(
                                        'manage',
                                        subject('Validation', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label="Validator"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/validator`}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconChecklist}
                                                />
                                            }
                                        />
                                    ) : null}

                                    {user.ability?.can(
                                        'manage',
                                        subject('ContentVerification', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label="Verified content"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/verifiedContent`}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconShieldCheck}
                                                />
                                            }
                                        />
                                    ) : null}

                                    {user.ability?.can(
                                        'promote',
                                        subject('SavedChart', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label="Data ops"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/dataOps`}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconDatabaseExport}
                                                />
                                            }
                                        />
                                    ) : null}

                                    {isGitProject &&
                                    user.ability?.can(
                                        'view',
                                        subject('SourceCode', {
                                            organizationUuid:
                                                project.organizationUuid,
                                            projectUuid: project.projectUuid,
                                        }),
                                    ) ? (
                                        <RouterNavLink
                                            label="Pull requests"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/pullRequests`}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconGitPullRequest}
                                                />
                                            }
                                        />
                                    ) : null}

                                    {health?.softDelete?.enabled && (
                                        <RouterNavLink
                                            label="Recently deleted"
                                            exact
                                            to={`/generalSettings/projectManagement/${project.projectUuid}/recentlyDeleted`}
                                            leftSection={
                                                <MantineIcon icon={IconTrash} />
                                            }
                                        />
                                    )}
                                </Box>
                            ) : null}
                        </Stack>
                    </ScrollArea>
                </Stack>
            }
        >
            {routeElements}
        </Page>
    );
};

export default Settings;
