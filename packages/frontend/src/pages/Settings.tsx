import { Menu, NonIdealState } from '@blueprintjs/core';
import { FC } from 'react';
import { Redirect, Route, Switch } from 'react-router-dom';
import Content from '../components/common/Page/Content';
import PageWithSidebar from '../components/common/Page/PageWithSidebar';
import Sidebar from '../components/common/Page/Sidebar';
import RouterMenuItem from '../components/common/RouterMenuItem';
import PageSpinner from '../components/PageSpinner';
import AccessTokensPanel from '../components/UserSettings/AccessTokensPanel';
import AppearancePanel from '../components/UserSettings/AppearancePanel';
import OrganisationPanel from '../components/UserSettings/OrganisationPanel';
import PasswordPanel from '../components/UserSettings/PasswordPanel';
import ProfilePanel from '../components/UserSettings/ProfilePanel';
import ProjectManagementPanel from '../components/UserSettings/ProjectManagementPanel';
import SlackSettingsPanel from '../components/UserSettings/SlackSettingsPanel';
import SocialLoginsPanel from '../components/UserSettings/SocialLoginsPanel';
import UserManagementPanel from '../components/UserSettings/UserManagementPanel';
import { useOrganisation } from '../hooks/organisation/useOrganisation';
import { useApp } from '../providers/AppProvider';
import { TrackPage } from '../providers/TrackingProvider';
import { PageName } from '../types/Events';
import { PasswordRecoveryForm } from './PasswordRecoveryForm';
import ProjectSettings from './ProjectSettings';
import {
    CardContainer,
    ContentWrapper,
    MenuHeader,
    MenuWrapper,
    Title,
} from './Settings.styles';

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
    } = useOrganisation();

    if (isHealthLoading || isUserLoading || isOrganizationLoading) {
        return <PageSpinner />;
    }

    if (userError || healthError || organizationError) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Unexpected error"
                    description={
                        userError?.error.message ||
                        healthError?.error.message ||
                        organizationError?.error.message
                    }
                />
            </div>
        );
    }

    if (!health || !user || !organization) return null;

    const basePath = `/generalSettings`;

    const allowPasswordAuthentication =
        !health.auth.disablePasswordAuthentication;

    const hasSocialLogin =
        health.auth.google.oauth2ClientId || health.auth.okta.enabled;

    return (
        <PageWithSidebar alignItems="flex-start">
            <Sidebar title="Settings" noMargin>
                <MenuWrapper>
                    <MenuHeader>User settings</MenuHeader>

                    <Menu>
                        <RouterMenuItem text="Profile" exact to={basePath} />

                        {allowPasswordAuthentication && (
                            <RouterMenuItem
                                text="Password"
                                exact
                                to={`${basePath}/password`}
                            />
                        )}

                        {(health.auth.google.oauth2ClientId ||
                            health.auth.okta.enabled) && (
                            <RouterMenuItem
                                text="Social logins"
                                exact
                                to={`${basePath}/socialLogins`}
                            />
                        )}

                        <RouterMenuItem
                            text="Personal access tokens"
                            exact
                            to={`${basePath}/personalAccessTokens`}
                        />
                    </Menu>
                </MenuWrapper>

                <MenuWrapper>
                    <MenuHeader>Organization settings</MenuHeader>

                    <Menu>
                        {user.ability.can('manage', 'Organization') && (
                            <RouterMenuItem
                                text="Organization"
                                exact
                                to={`${basePath}/organization`}
                            />
                        )}

                        {user.ability.can(
                            'view',
                            'OrganizationMemberProfile',
                        ) && (
                            <RouterMenuItem
                                text="User management"
                                to={`${basePath}/userManagement`}
                            />
                        )}

                        {organization &&
                            !organization.needsProject &&
                            user.ability.can('view', 'Project') && (
                                <RouterMenuItem
                                    text="Project management"
                                    to={`${basePath}/projectManagement`}
                                />
                            )}

                        <RouterMenuItem
                            text="Appearance"
                            exact
                            to={`${basePath}/appearance`}
                        />

                        {localStorage.getItem('slack') && (
                            <RouterMenuItem
                                text="Slack"
                                exact
                                to={`${basePath}/slack`}
                            />
                        )}
                    </Menu>
                </MenuWrapper>
            </Sidebar>

            <Switch>
                {allowPasswordAuthentication && (
                    <Route exact path={`/generalSettings/password`}>
                        <Content>
                            <CardContainer>
                                <Title>Password settings</Title>

                                {hasSocialLogin ? (
                                    <PasswordRecoveryForm />
                                ) : (
                                    <PasswordPanel />
                                )}
                            </CardContainer>
                        </Content>
                    </Route>
                )}

                {hasSocialLogin && (
                    <Route exact path={`/generalSettings/socialLogins`}>
                        <Content>
                            <CardContainer>
                                <Title>Social logins</Title>
                                <SocialLoginsPanel />
                            </CardContainer>
                        </Content>
                    </Route>
                )}

                {user.ability.can('manage', 'Organization') && (
                    <Route exact path={`/generalSettings/organization`}>
                        <Content>
                            <CardContainer>
                                <Title>Organization settings</Title>
                                <OrganisationPanel />
                            </CardContainer>
                        </Content>
                    </Route>
                )}

                {user.ability.can('view', 'OrganizationMemberProfile') && (
                    <Route path={`/generalSettings/userManagement`}>
                        <Content>
                            <ContentWrapper>
                                <UserManagementPanel />
                            </ContentWrapper>
                        </Content>
                    </Route>
                )}

                {organization &&
                    !organization.needsProject &&
                    user.ability.can('view', 'Project') && (
                        <Route
                            exact
                            path={`/generalSettings/projectManagement`}
                        >
                            <Content>
                                <ContentWrapper>
                                    <ProjectManagementPanel />
                                </ContentWrapper>
                            </Content>
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
                                <Content>
                                    <ContentWrapper>
                                        <ProjectSettings />
                                    </ContentWrapper>
                                </Content>
                            </TrackPage>
                        </Route>
                    )}

                <Route exact path={`/generalSettings/appearance`}>
                    <Content>
                        <CardContainer>
                            <Title>Appearance settings</Title>
                            <AppearancePanel />
                        </CardContainer>
                    </Content>
                </Route>

                <Route exact path={`/generalSettings/personalAccessTokens`}>
                    <Content>
                        <ContentWrapper>
                            <AccessTokensPanel />
                        </ContentWrapper>
                    </Content>
                </Route>
                <Route exact path={`/generalSettings/slack`}>
                    <Content>
                        <CardContainer>
                            <SlackSettingsPanel />
                        </CardContainer>
                    </Content>
                </Route>
                <Route exact path={`/generalSettings`}>
                    <Content>
                        <CardContainer>
                            <Title>Profile settings</Title>
                            <ProfilePanel />
                        </CardContainer>
                    </Content>
                </Route>

                <Redirect to={basePath} />
            </Switch>
        </PageWithSidebar>
    );
};

export default Settings;
