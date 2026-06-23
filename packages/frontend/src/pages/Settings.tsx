import { subject } from '@casl/ability';
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
import { useDebouncedValue, useLocalStorage } from '@mantine-8/hooks';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
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
import { SettingsGridCard } from '../components/common/Settings/SettingsCard';
import PageSpinner from '../components/PageSpinner';
import ProjectSettings from '../components/Settings/ProjectSettings';
import SettingsNavigation from '../components/Settings/SettingsNavigation';
import SettingsSearchInput from '../components/Settings/SettingsSearchInput';
import AccessTokensPanel from '../components/UserSettings/AccessTokensPanel';
import AllowedDomainsPanel from '../components/UserSettings/AllowedDomainsPanel';
import AppearanceSettingsPanel from '../components/UserSettings/AppearanceSettingsPanel';
import DefaultProjectPanel from '../components/UserSettings/DefaultProjectPanel';
import { DeleteOrganizationPanel } from '../components/UserSettings/DeleteOrganizationPanel';
import ExportingPanel from '../components/UserSettings/ExportingPanel';
import GithubSettingsPanel from '../components/UserSettings/GithubSettingsPanel';
import GithubUserSettingsPanel from '../components/UserSettings/GithubUserSettingsPanel';
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
import { ReviewRemediationWorkspace } from '../ee/features/aiCopilot/components/Admin/ReviewRemediationWorkspace';
import { AiAgentsSettingsPage } from '../ee/features/aiCopilot/components/Admin/settings/AiAgentsSettingsPage';
import { AiGeneralSettingsPage } from '../ee/features/aiCopilot/components/Admin/settings/AiGeneralSettingsPage';
import { AiReviewsSettingsPage } from '../ee/features/aiCopilot/components/Admin/settings/AiReviewsSettingsPage';
import { AiSettingsProviders } from '../ee/features/aiCopilot/components/Admin/settings/AiSettingsProviders';
import { AiThreadsSettingsPage } from '../ee/features/aiCopilot/components/Admin/settings/AiThreadsSettingsPage';
import ScimAccessTokensPanel from '../ee/features/scim/components/ScimAccessTokensPanel';
import { ServiceAccountsPage } from '../ee/features/serviceAccounts';
import { CustomRoleCreate } from '../ee/pages/customRoles/CustomRoleCreate';
import { CustomRoleEdit } from '../ee/pages/customRoles/CustomRoleEdit';
import { CustomRoles } from '../ee/pages/customRoles/CustomRoles';
import DesignListPage from '../features/organizationDesigns/components/DesignListPage';
import { filterSettingsNavigation } from '../hooks/settings/filterSettingsNavigation';
import { useSettingsContext } from '../hooks/settings/useSettingsContext';
import { useSettingsNavigation } from '../hooks/settings/useSettingsNavigation';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import { PageName } from '../types/Events';
import classes from './Settings.module.css';

const SETTINGS_SIDEBAR_COLLAPSED_STORAGE_KEY = 'settings:sidebar-collapsed';

const Settings: FC = () => {
    const context = useSettingsContext();
    const sections = useSettingsNavigation(context);

    const [isSidebarCollapsed, setIsSidebarCollapsed] =
        useLocalStorage<boolean>({
            key: SETTINGS_SIDEBAR_COLLAPSED_STORAGE_KEY,
            defaultValue: false,
            getInitialValueInEffect: false,
        });
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 200);

    const filteredSections = useMemo(
        () => filterSettingsNavigation(sections, debouncedSearch),
        [sections, debouncedSearch],
    );

    const location = useLocation();
    // Reset the search on navigation so each visit starts unfiltered; done
    // during render rather than an effect, which would lag the route change.
    const [prevPathname, setPrevPathname] = useState(location.pathname);
    if (prevPathname !== location.pathname) {
        setPrevPathname(location.pathname);
        setSearch('');
    }

    const {
        user,
        health,
        organization,
        project,
        isScimTokenManagementEnabled,
        dataAppsFlag,
        isAiCopilotEnabledOrTrial,
        shouldShowAiAgentReviews,
        isAiOrganizationSettingsLoading,
        showImpersonationPanel,
        isLeaveOrganizationEnabled,
        isCustomRolesEnabled,
        isProLimitsEnabled,
        isSsoOrganizationSettingsEnabled,
        isServiceAccountsEnabled,
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
    } = context;

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
                        {health?.hasGithub && <GithubUserSettingsPanel />}
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
                allowedRoutes.push({
                    path: '/ai/reviews/:fingerprint',
                    element: (
                        <AiSettingsProviders>
                            <ReviewRemediationWorkspace />
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
            ) &&
            !matchPath(
                { path: '/generalSettings/ai/reviews/:fingerprint' },
                location.pathname,
            )
        );
    }, [location.pathname]);

    if (
        isHealthLoading ||
        isUserLoading ||
        isOrganizationLoading ||
        isActiveProjectUuidLoading ||
        isProjectLoading ||
        // Wait for AI org settings so the /ai/reviews route is registered before
        // routing — otherwise a hard refresh there falls through to the default.
        isAiOrganizationSettingsLoading
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
                                    setIsSidebarCollapsed(!isSidebarCollapsed)
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
                    <SettingsSearchInput value={search} onChange={setSearch} />
                    <ScrollArea
                        type="scroll"
                        scrollbarSize={8}
                        scrollHideDelay={800}
                        className={classes.sidebarScroll}
                    >
                        {filteredSections.length > 0 ? (
                            <SettingsNavigation
                                sections={filteredSections}
                                searchQuery={debouncedSearch}
                            />
                        ) : (
                            <Stack gap="xs" align="center" py="xl" px="md">
                                <Text fz="sm" c="ldGray.6" ta="center">
                                    No settings match “{debouncedSearch.trim()}”
                                </Text>
                                <Anchor
                                    component="button"
                                    type="button"
                                    fz="xs"
                                    onClick={() => setSearch('')}
                                >
                                    Clear search
                                </Anchor>
                            </Stack>
                        )}
                    </ScrollArea>
                </Stack>
            }
        >
            {routeElements}
        </Page>
    );
};

export default Settings;
