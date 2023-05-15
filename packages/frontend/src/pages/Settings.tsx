import { subject } from '@casl/ability';
import { Box, NavLink, Stack, Title } from '@mantine/core';
import {
    IconBuildingSkyscraper,
    IconDatabase,
    IconKey,
    IconLock,
    IconPalette,
    IconPlug,
    IconUserCircle,
    IconUserPlus,
} from '@tabler/icons-react';
import { FC } from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';
import { Can } from '../components/common/Authorization';
import ErrorState from '../components/common/ErrorState';
import MantineIcon from '../components/common/MantineIcon';
import Page from '../components/common/Page/Page';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import RouterNavLink from '../components/common/RouterNavLink';
import PageSpinner from '../components/PageSpinner';
import AccessTokensPanel from '../components/UserSettings/AccessTokensPanel';
import AllowedDomainsPanel from '../components/UserSettings/AllowedDomainsPanel';
import AppearancePanel from '../components/UserSettings/AppearancePanel';
import { DeleteOrganizationPanel } from '../components/UserSettings/DeleteOrganizationPanel';
import { Description } from '../components/UserSettings/DeleteOrganizationPanel/DeleteOrganizationPanel.styles';
import OrganizationPanel from '../components/UserSettings/OrganizationPanel';
import PasswordPanel from '../components/UserSettings/PasswordPanel';
import ProfilePanel from '../components/UserSettings/ProfilePanel';
import ProjectManagementPanel from '../components/UserSettings/ProjectManagementPanel';
import SlackSettingsPanel from '../components/UserSettings/SlackSettingsPanel';
import SocialLoginsPanel from '../components/UserSettings/SocialLoginsPanel';
import UserManagementPanel from '../components/UserSettings/UserManagementPanel';
import { useOrganization } from '../hooks/organization/useOrganization';
import { useApp } from '../providers/AppProvider';
import { TrackPage } from '../providers/TrackingProvider';
import { PageName } from '../types/Events';
import ProjectSettings from './ProjectSettings';
import { CardContainer } from './Settings.styles';

const Settings: FC = () => {
    const {
        health: {
            data: health,
            isLoading: isHealthLoading,
            error: healthError,
        },
        user: { data: user, isLoading: isUserLoading, error: userError },
    } = useApp();
    const {
        data: organization,
        isLoading: isOrganizationLoading,
        error: organizationError,
    } = useOrganization();

    if (isHealthLoading || isUserLoading || isOrganizationLoading) {
        return <PageSpinner />;
    }

    if (userError || healthError || organizationError) {
        return (
            <ErrorState
                error={
                    userError?.error ||
                    healthError?.error ||
                    organizationError?.error
                }
            />
        );
    }

    if (!health || !user || !organization) return null;

    const basePath = `/generalSettings`;

    const allowPasswordAuthentication =
        !health.auth.disablePasswordAuthentication;

    const hasSocialLogin =
        health.auth.google.oauth2ClientId ||
        health.auth.okta.enabled ||
        health.auth.oneLogin.enabled;

    return (
        <Page
            withFullHeight
            withSidebarFooter
            withFixedContent
            withPaddedContent
            title="Settings"
            sidebar={
                <Stack sx={{ flexGrow: 1, overflow: 'hidden' }}>
                    <PageBreadcrumbs
                        items={[{ title: 'Settings', active: true }]}
                    />

                    <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
                        <NavLink
                            label="Your settings"
                            opened
                            childrenOffset={0}
                        >
                            <RouterNavLink
                                exact
                                to={basePath}
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
                                    to={`${basePath}/password`}
                                    icon={<MantineIcon icon={IconLock} />}
                                />
                            )}

                            <RouterNavLink
                                label="Personal access tokens"
                                exact
                                to={`${basePath}/personalAccessTokens`}
                                icon={<MantineIcon icon={IconKey} />}
                            />
                        </NavLink>

                        <Can
                            I="create"
                            this={subject('Project', {
                                organizationUuid: organization.organizationUuid,
                            })}
                        >
                            <NavLink
                                label="Organization settings"
                                opened
                                childrenOffset={0}
                            >
                                {user.ability.can('manage', 'Organization') && (
                                    <RouterNavLink
                                        label="General"
                                        exact
                                        to={`${basePath}/organization`}
                                        icon={
                                            <MantineIcon
                                                icon={IconBuildingSkyscraper}
                                            />
                                        }
                                    />
                                )}

                                {user.ability.can(
                                    'view',
                                    'OrganizationMemberProfile',
                                ) && (
                                    <RouterNavLink
                                        label="User management"
                                        to={`${basePath}/userManagement`}
                                        icon={
                                            <MantineIcon icon={IconUserPlus} />
                                        }
                                    />
                                )}

                                {organization &&
                                    !organization.needsProject &&
                                    user.ability.can('view', 'Project') && (
                                        <RouterNavLink
                                            label="Projects"
                                            to={`${basePath}/projectManagement`}
                                            icon={
                                                <MantineIcon
                                                    icon={IconDatabase}
                                                />
                                            }
                                        />
                                    )}

                                <RouterNavLink
                                    label="Appearance"
                                    exact
                                    to={`${basePath}/appearance`}
                                    icon={<MantineIcon icon={IconPalette} />}
                                />

                                {health.hasSlack &&
                                    user.ability.can(
                                        'manage',
                                        'Organization',
                                    ) && (
                                        <RouterNavLink
                                            label="Integrations"
                                            exact
                                            to={`${basePath}/integrations/slack`}
                                            icon={
                                                <MantineIcon icon={IconPlug} />
                                            }
                                        />
                                    )}
                            </NavLink>
                        </Can>
                    </Box>
                </Stack>
            }
        >
            <Switch>
                {allowPasswordAuthentication && (
                    <Route exact path={`/generalSettings/password`}>
                        <CardContainer>
                            <Title order={4}>Password settings</Title>
                            <PasswordPanel />
                        </CardContainer>
                        {hasSocialLogin && (
                            <CardContainer>
                                <Title order={4}>Social logins</Title>
                                <SocialLoginsPanel />
                            </CardContainer>
                        )}
                    </Route>
                )}

                {user.ability.can('manage', 'Organization') && (
                    <Route exact path={`/generalSettings/organization`}>
                        <CardContainer>
                            <Title order={4}>General</Title>
                            <OrganizationPanel />
                        </CardContainer>
                        <CardContainer>
                            <div>
                                <Title order={4}>Allowed email domains</Title>
                                <Description>
                                    Anyone with email addresses at these domains
                                    can automatically join the organization.
                                </Description>
                            </div>
                            <AllowedDomainsPanel />
                        </CardContainer>
                        {user.ability?.can('delete', 'Organization') && (
                            <CardContainer>
                                <div>
                                    <Title order={4}>Danger zone </Title>
                                    <Description>
                                        This action deletes the whole workspace
                                        and all its content, including users.
                                        This action is not reversible.
                                    </Description>
                                </div>
                                <DeleteOrganizationPanel />
                            </CardContainer>
                        )}
                    </Route>
                )}

                {user.ability.can('view', 'OrganizationMemberProfile') && (
                    <Route path={`/generalSettings/userManagement`}>
                        <UserManagementPanel />
                    </Route>
                )}

                {organization &&
                    !organization.needsProject &&
                    user.ability.can('view', 'Project') && (
                        <Route
                            exact
                            path={`/generalSettings/projectManagement`}
                        >
                            <ProjectManagementPanel />
                        </Route>
                    )}

                {organization &&
                    !organization.needsProject &&
                    user.ability.can('view', 'Project') && (
                        <Route
                            exact
                            path={[
                                '/generalSettings/projectManagement/:projectUuid/:tab?',
                                '/generalSettings/projectManagement/:projectUuid/integrations/:tab',
                            ]}
                        >
                            <TrackPage name={PageName.PROJECT_SETTINGS}>
                                <ProjectSettings />
                            </TrackPage>
                        </Route>
                    )}

                <Route exact path={`/generalSettings/appearance`}>
                    <CardContainer>
                        <Title order={4}>Appearance settings</Title>
                        <AppearancePanel />
                    </CardContainer>
                </Route>

                <Route exact path={`/generalSettings/personalAccessTokens`}>
                    <AccessTokensPanel />
                </Route>

                {health.hasSlack && user.ability.can('manage', 'Organization') && (
                    <Route exact path={`/generalSettings/integrations/slack`}>
                        <CardContainer>
                            <SlackSettingsPanel />
                        </CardContainer>
                    </Route>
                )}

                <Route exact path={`/generalSettings`}>
                    <CardContainer>
                        <Title order={4}>Profile settings</Title>
                        <ProfilePanel />
                    </CardContainer>
                </Route>

                <Redirect to={basePath} />
            </Switch>
        </Page>
    );
};

export default Settings;
