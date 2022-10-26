import { Collapse } from '@blueprintjs/core';
import { FC, useState } from 'react';
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
    CollapseTrigger,
    ContentWrapper,
    ExpandableWrapper,
    SettingsItems,
    SidebarMenu,
    Title,
} from './Settings.styles';

interface ExpandableSectionProps {
    label: string;
}

const ExpandableSection: FC<ExpandableSectionProps> = ({ label, children }) => {
    const [isOpen, setIsOpen] = useState<boolean>(true);

    return (
        <ExpandableWrapper>
            <CollapseTrigger
                icon={isOpen ? 'chevron-down' : 'chevron-right'}
                text={label}
                minimal
                onClick={() => setIsOpen((prev) => !prev)}
            />
            <Collapse isOpen={isOpen}>
                <SettingsItems>{children}</SettingsItems>
            </Collapse>
        </ExpandableWrapper>
    );
};

const Settings: FC = () => {
    const { health, user } = useApp();
    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;
    const { data: orgData, isLoading } = useOrganisation();

    const basePath = `/generalSettings`;

    if (isLoading) {
        return <PageSpinner />;
    }

    const hasSocialLogin =
        health.data?.auth.google.oauth2ClientId ||
        health.data?.auth.okta.enabled;
    return (
        <PageWithSidebar>
            <Sidebar title="Settings" noMargin>
                <SidebarMenu>
                    <ExpandableSection label="User settings">
                        <RouterMenuItem text="Profile" exact to={basePath} />
                        {allowPasswordAuthentication && (
                            <RouterMenuItem
                                text="Password"
                                exact
                                to={`${basePath}/password`}
                            />
                        )}
                        {(health.data?.auth.google.oauth2ClientId ||
                            health.data?.auth.okta.enabled) && (
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
                    </ExpandableSection>
                    <ExpandableSection label="Organization settings">
                        {user.data?.ability?.can('manage', 'Organization') && (
                            <RouterMenuItem
                                text="Organization"
                                exact
                                to={`${basePath}/organization`}
                            />
                        )}
                        {user.data?.ability?.can(
                            'view',
                            'OrganizationMemberProfile',
                        ) && (
                            <RouterMenuItem
                                text="User management"
                                to={`${basePath}/userManagement`}
                            />
                        )}
                        {orgData &&
                            !orgData.needsProject &&
                            user.data?.ability?.can('view', 'Project') && (
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
                    </ExpandableSection>
                </SidebarMenu>
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
                {user.data?.ability?.can('manage', 'Organization') && (
                    <Route exact path={`/generalSettings/organization`}>
                        <Content>
                            <CardContainer>
                                <Title>Organization settings</Title>
                                <OrganisationPanel />
                            </CardContainer>
                        </Content>
                    </Route>
                )}
                {user.data?.ability?.can(
                    'view',
                    'OrganizationMemberProfile',
                ) && (
                    <Route path={`/generalSettings/userManagement`}>
                        <Content>
                            <ContentWrapper>
                                <UserManagementPanel />
                            </ContentWrapper>
                        </Content>
                    </Route>
                )}
                {orgData &&
                    !orgData.needsProject &&
                    user.data?.ability?.can('view', 'Project') && (
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

                {orgData &&
                    !orgData.needsProject &&
                    user.data?.ability?.can('manage', 'Project') && (
                        <Route
                            exact
                            path={[
                                '/generalSettings/projectManagement/:projectUuid/:tab?',
                                '/generalSettings/projectManagement/:projectUuid/integration/:tab',
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
