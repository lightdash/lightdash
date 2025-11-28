import { subject } from '@casl/ability';
import { CommercialFeatureFlags, FeatureFlags } from '@lightdash/common';
import { Box, ScrollArea, Stack, Text, Title } from '@mantine/core';
import {
    IconBrain,
    IconBrowser,
    IconBuildingSkyscraper,
    IconCalendarStats,
    IconChecklist,
    IconDatabase,
    IconDatabaseCog,
    IconDatabaseExport,
    IconHistory,
    IconIdBadge2,
    IconKey,
    IconLock,
    IconPalette,
    IconPlug,
    IconRefresh,
    IconReportAnalytics,
    IconTableOptions,
    IconUserCircle,
    IconUserCode,
    IconUserPlus,
    IconUserShield,
    IconUsers,
    IconVariable,
} from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import {
    Navigate,
    matchPath,
    useLocation,
    useRoutes,
    type RouteObject,
} from 'react-router';
import PageSpinner from '../components/PageSpinner';
import AccessTokensPanel from '../components/UserSettings/AccessTokensPanel';
import AllowedDomainsPanel from '../components/UserSettings/AllowedDomainsPanel';
import AppearanceSettingsPanel from '../components/UserSettings/AppearanceSettingsPanel';
import DefaultProjectPanel from '../components/UserSettings/DefaultProjectPanel';
import { DeleteOrganizationPanel } from '../components/UserSettings/DeleteOrganizationPanel';
import GithubSettingsPanel from '../components/UserSettings/GithubSettingsPanel';
import GitlabSettingsPanel from '../components/UserSettings/GitlabSettingsPanel';
import { MyWarehouseConnectionsPanel } from '../components/UserSettings/MyWarehouseConnectionsPanel';
import OrganizationPanel from '../components/UserSettings/OrganizationPanel';
import { OrganizationWarehouseCredentialsPanel } from '../components/UserSettings/OrganizationWarehouseCredentialsPanel';
import PasswordPanel from '../components/UserSettings/PasswordPanel';
import ProfilePanel from '../components/UserSettings/ProfilePanel';
import ProjectManagementPanel from '../components/UserSettings/ProjectManagementPanel';
import SlackSettingsPanel from '../components/UserSettings/SlackSettingsPanel';
import SocialLoginsPanel from '../components/UserSettings/SocialLoginsPanel';
import UserAttributesPanel from '../components/UserSettings/UserAttributesPanel';
import UsersAndGroupsPanel from '../components/UserSettings/UsersAndGroupsPanel';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import RouterNavLink from '../components/common/RouterNavLink';
import { SettingsGridCard } from '../components/common/Settings/SettingsCard';
import { useAiOrganizationSettings } from '../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import ScimAccessTokensPanel from '../ee/features/scim/components/ScimAccessTokensPanel';
import { ServiceAccountsPage } from '../ee/features/serviceAccounts';
import { CustomRoleCreate } from '../ee/pages/customRoles/CustomRoleCreate';
import { CustomRoleEdit } from '../ee/pages/customRoles/CustomRoleEdit';
import { CustomRoles } from '../ee/pages/customRoles/CustomRoles';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useActiveProjectUuid } from '../hooks/useActiveProject';
import {
    useFeatureFlag,
    useFeatureFlagEnabled,
} from '../hooks/useFeatureFlagEnabled';
import { useProject } from '../hooks/useProject';
import { Can } from '../providers/Ability';
import useApp from '../providers/App/useApp';
import { TrackPage } from '../providers/Tracking/TrackingProvider';
import useTracking from '../providers/Tracking/useTracking';
import { EventName, PageName } from '../types/Events';
import ProjectSettings from './ProjectSettings';

const Settings: FC = () => {
    const { data: embeddingEnabled } = useFeatureFlag(
        CommercialFeatureFlags.Embedding,
    );

    const { data: isScimTokenManagementEnabled } = useFeatureFlag(
        CommercialFeatureFlags.Scim,
    );

    const aiOrganizationSettingsQuery = useAiOrganizationSettings();
    const isAiCopilotEnabledOrTrial =
        (aiOrganizationSettingsQuery.isSuccess &&
            aiOrganizationSettingsQuery.data?.isCopilotEnabled) ||
        aiOrganizationSettingsQuery.data?.isTrial;

    const isServiceAccountFeatureFlagEnabled = useFeatureFlagEnabled(
        CommercialFeatureFlags.ServiceAccounts,
    );

    const {
        health: {
            data: health,
            isInitialLoading: isHealthLoading,
            error: healthError,
        },
        user: { data: user, isInitialLoading: isUserLoading, error: userError },
    } = useApp();

    const isCustomRolesEnabled = health?.isCustomRolesEnabled;

    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

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

    const allowPasswordAuthentication =
        !health?.auth.disablePasswordAuthentication;

    const hasSocialLogin =
        health?.auth.google.enabled ||
        health?.auth.okta.enabled ||
        health?.auth.oneLogin.enabled ||
        health?.auth.azuread.enabled ||
        health?.auth.oidc.enabled;

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    // This allows us to enable service accounts in the UI for on-premise installations
    const isServiceAccountsEnabled =
        health?.isServiceAccountEnabled || isServiceAccountFeatureFlagEnabled;

    const isWarehouseCredentialsFeatureFlagEnabled = useFeatureFlagEnabled(
        CommercialFeatureFlags.OrganizationWarehouseCredentials,
    );

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
                    <SettingsGridCard>
                        <Title order={4}>Profile settings</Title>
                        <ProfilePanel />
                    </SettingsGridCard>
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
                    <Stack spacing="xl">
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
                <Stack spacing="xl">
                    <MyWarehouseConnectionsPanel />
                </Stack>
            ),
        });
        if (user?.ability.can('manage', 'PersonalAccessToken')) {
            allowedRoutes.push({
                path: '/organization',
                element: (
                    <Stack spacing="xl">
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

                        {user.ability?.can('delete', 'Organization') && (
                            <SettingsGridCard>
                                <div>
                                    <Title order={4}>Danger zone </Title>
                                    <Text c="ldGray.6" fz="xs">
                                        This action deletes the whole workspace
                                        and all its content, including users.
                                        This action is not reversible.
                                    </Text>
                                </div>
                                <DeleteOrganizationPanel />
                            </SettingsGridCard>
                        )}
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
        isServiceAccountsEnabled,
        isScimTokenManagementEnabled?.enabled,
        allowPasswordAuthentication,
        hasSocialLogin,
        user,
        organization,
        project,
        health,
        isCustomRolesEnabled,
    ]);
    const routeElements = useRoutes(routes);

    const location = useLocation();
    const isFixedContent = useMemo(() => {
        return (
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
                    path: '/generalSettings/projectManagement/:projectUuid/compilationHistory',
                },
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
            sidebar={
                <Stack sx={{ flexGrow: 1, overflow: 'hidden' }}>
                    <PageBreadcrumbs
                        items={[{ title: 'Settings', active: true }]}
                    />
                    <ScrollArea
                        variant="primary"
                        offsetScrollbars
                        scrollbarSize={8}
                    >
                        <Stack spacing="lg">
                            <Box>
                                <Title order={6} fw={600} mb="xs">
                                    Your settings
                                </Title>

                                <RouterNavLink
                                    exact
                                    to="/generalSettings"
                                    label="Profile"
                                    icon={<MantineIcon icon={IconUserCircle} />}
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
                                        icon={<MantineIcon icon={IconLock} />}
                                    />
                                )}

                                <RouterNavLink
                                    label="My warehouse connections"
                                    exact
                                    to="/generalSettings/myWarehouseConnections"
                                    icon={
                                        <MantineIcon icon={IconDatabaseCog} />
                                    }
                                />
                                {user.ability.can(
                                    'manage',
                                    'PersonalAccessToken',
                                ) && (
                                    <RouterNavLink
                                        label="Personal access tokens"
                                        exact
                                        to="/generalSettings/personalAccessTokens"
                                        icon={<MantineIcon icon={IconKey} />}
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
                                        icon={
                                            <MantineIcon
                                                icon={IconBuildingSkyscraper}
                                            />
                                        }
                                    />
                                )}
                                {isCustomRolesEnabled && (
                                    <Can I="manage" a="Organization">
                                        <RouterNavLink
                                            label="Custom roles"
                                            to="/generalSettings/customRoles"
                                            exact
                                            icon={
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
                                        icon={
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
                                        icon={
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
                                        icon={
                                            <MantineIcon icon={IconPalette} />
                                        }
                                    />
                                )}

                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label="Integrations"
                                        exact
                                        to="/generalSettings/integrations"
                                        icon={<MantineIcon icon={IconPlug} />}
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
                                            icon={
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
                                            icon={
                                                <MantineIcon
                                                    icon={IconDatabase}
                                                />
                                            }
                                        />
                                    )}

                                {user.ability.can('manage', 'Organization') &&
                                    isScimTokenManagementEnabled?.enabled && (
                                        <RouterNavLink
                                            label="SCIM Access Tokens"
                                            exact
                                            to="/generalSettings/scimAccessTokens"
                                            icon={
                                                <MantineIcon icon={IconKey} />
                                            }
                                        />
                                    )}
                                {user.ability.can('manage', 'Organization') &&
                                    isServiceAccountsEnabled && (
                                        <RouterNavLink
                                            label="Service Accounts"
                                            exact
                                            to="/generalSettings/serviceAccounts"
                                            icon={
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
                                            label="AI Agents"
                                            exact
                                            to="/ai-agents/admin"
                                            icon={
                                                <MantineIcon icon={IconBrain} />
                                            }
                                        />
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
                                    <Title order={6} fw={600} mb="xs">
                                        Current project ({project?.name})
                                    </Title>

                                    <RouterNavLink
                                        label="Connection settings"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/settings`}
                                        icon={
                                            <MantineIcon
                                                icon={IconDatabaseCog}
                                            />
                                        }
                                    />

                                    <RouterNavLink
                                        label="Tables configuration"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/tablesConfiguration`}
                                        icon={
                                            <MantineIcon
                                                icon={IconTableOptions}
                                            />
                                        }
                                    />

                                    <RouterNavLink
                                        label="Changesets"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/changesets`}
                                        icon={
                                            <MantineIcon icon={IconHistory} />
                                        }
                                    />

                                    <RouterNavLink
                                        label="Compilation history"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/compilationHistory`}
                                        icon={
                                            <MantineIcon icon={IconRefresh} />
                                        }
                                    />

                                    <RouterNavLink
                                        label="Parameters"
                                        exact
                                        to={`/generalSettings/projectManagement/${project.projectUuid}/parameters`}
                                        icon={
                                            <MantineIcon icon={IconVariable} />
                                        }
                                    />

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
                                            icon={
                                                <MantineIcon icon={IconUsers} />
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
                                            icon={
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
                                        icon={
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
                                            icon={
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
                                            icon={
                                                <MantineIcon
                                                    icon={IconChecklist}
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
                                            icon={
                                                <MantineIcon
                                                    icon={IconDatabaseExport}
                                                />
                                            }
                                        />
                                    ) : null}
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
