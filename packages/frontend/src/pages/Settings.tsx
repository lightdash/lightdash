import { Menu, NonIdealState, Spinner } from '@blueprintjs/core';
import React, { FC, useMemo, useState } from 'react';
import { Redirect, Route, Switch, useParams } from 'react-router-dom';
import Content from '../components/common/Page/Content';
import PageWithSidebar from '../components/common/Page/PageWithSidebar';
import Sidebar from '../components/common/Page/Sidebar';
import RouterMenuItem from '../components/common/RouterMenuItem';
import AccessTokensPanel from '../components/UserSettingsModal/AccessTokensPanel';
import AppearancePanel from '../components/UserSettingsModal/AppearancePanel';
import OrganisationPanel from '../components/UserSettingsModal/OrganisationPanel';
import PasswordPanel from '../components/UserSettingsModal/PasswordPanel';
import ProfilePanel from '../components/UserSettingsModal/ProfilePanel';
import ProjectManagementPanel from '../components/UserSettingsModal/ProjectManagementPanel';
import UserManagementPanel from '../components/UserSettingsModal/UserManagementPanel';
import { useProject } from '../hooks/useProject';
import { useApp } from '../providers/AppProvider';
import { CardContainer, ContentWrapper, Title } from './Settings.styles';

const Settings: FC = () => {
    const { health } = useApp();
    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;
    const [showInvitePage, setShowInvitePage] = useState(false);

    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { isLoading, data, error } = useProject(projectUuid);

    const basePath = useMemo(
        () => `/projects/${projectUuid}/generalSettings`,
        [projectUuid],
    );

    if (error) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState
                    title="Error loading project"
                    description={error.error.message}
                />
            </div>
        );
    }

    if (isLoading || !data) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading project" icon={<Spinner />} />
            </div>
        );
    }
    const userManagementProps = {
        showInvitePage,
        setShowInvitePage,
    };
    return (
        <PageWithSidebar>
            <Sidebar title="Settings" noMargin>
                <Menu>
                    <RouterMenuItem text="Profile" exact to={basePath} />

                    <RouterMenuItem
                        text="Password"
                        exact
                        to={`${basePath}/password`}
                    />
                    <RouterMenuItem
                        text="Organization"
                        exact
                        to={`${basePath}/organization`}
                    />
                    <RouterMenuItem
                        text="User management"
                        exact
                        to={`${basePath}/userManagement`}
                    />
                    <RouterMenuItem
                        text="Project management"
                        exact
                        to={`${basePath}/projectManagement`}
                    />
                    <RouterMenuItem
                        text="Appearance"
                        exact
                        to={`${basePath}/appearance`}
                    />
                    <RouterMenuItem
                        text="Personal access tokens"
                        exact
                        to={`${basePath}/personalAccessTokens`}
                    />
                </Menu>
            </Sidebar>

            <Switch>
                <Route
                    exact
                    path="/projects/:projectUuid/generalSettings/password"
                >
                    <Content>
                        <CardContainer>
                            <Title>Password settings</Title>
                            <PasswordPanel />
                        </CardContainer>
                    </Content>
                </Route>
                <Route
                    exact
                    path="/projects/:projectUuid/generalSettings/organization"
                >
                    <Content>
                        <CardContainer>
                            <Title>Organization settings</Title>
                            <OrganisationPanel />
                        </CardContainer>
                    </Content>
                </Route>
                <Route
                    exact
                    path="/projects/:projectUuid/generalSettings/userManagement"
                >
                    <Content>
                        <ContentWrapper>
                            <UserManagementPanel {...userManagementProps} />
                        </ContentWrapper>
                    </Content>
                </Route>
                <Route
                    exact
                    path="/projects/:projectUuid/generalSettings/projectManagement"
                >
                    <Content>
                        <ContentWrapper>
                            <ProjectManagementPanel />
                        </ContentWrapper>
                    </Content>
                </Route>
                <Route
                    exact
                    path="/projects/:projectUuid/generalSettings/appearance"
                >
                    <Content>
                        <CardContainer>
                            <Title>Appearance settings</Title>
                            <AppearancePanel />
                        </CardContainer>
                    </Content>
                </Route>
                <Route
                    exact
                    path="/projects/:projectUuid/generalSettings/personalAccessTokens"
                >
                    <Content>
                        <ContentWrapper>
                            <AccessTokensPanel />
                        </ContentWrapper>
                    </Content>
                </Route>

                <Route exact path="/projects/:projectUuid/generalSettings">
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
