import { Dialog, Tab, Tabs } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useOrganisation } from '../../hooks/organisation/useOrganisation';
import useLocationChange from '../../hooks/useLocationChange';
import { useApp } from '../../providers/AppProvider';
import { TrackPage } from '../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../types/Events';
import AccessTokensPanel from './AccessTokensPanel';
import AppearancePanel from './AppearancePanel';
import OrganisationPanel from './OrganisationPanel';
import PasswordPanel from './PasswordPanel';
import ProfilePanel from './ProfilePanel';
import ProjectManagementPanel from './ProjectManagementPanel';
import SocialLoginsPanel from './SocialLoginsPanel';
import UserManagementPanel from './UserManagementPanel';
import './UserSettingsModal.css';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    activeTab: string | undefined;
    onChangeTab: (tab: string) => void;
    panelProps: {
        userManagementProps: React.ComponentProps<typeof UserManagementPanel>;
    };
}

const UserSettingsModal: FC<Props> = ({
    isOpen,
    onClose,
    activeTab,
    onChangeTab,
    panelProps,
}) => {
    const { user, health } = useApp();
    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;
    useLocationChange(onClose);

    const { data: orgData } = useOrganisation();

    return (
        <Dialog
            isOpen={isOpen}
            icon="cog"
            onClose={onClose}
            title="Settings"
            lazy
            canOutsideClickClose={false}
            style={{ paddingBottom: 0, minWidth: 700, height: 500 }}
        >
            <div className="user-settings">
                <Tabs
                    id="user-settings"
                    selectedTabId={activeTab}
                    onChange={onChangeTab}
                    renderActiveTabPanelOnly
                    vertical
                    animate={false}
                >
                    <Tab
                        id="profile"
                        title="Profile"
                        panel={
                            <TrackPage
                                name={PageName.PROFILE_SETTINGS}
                                type={PageType.MODAL}
                                category={CategoryName.SETTINGS}
                            >
                                <ProfilePanel />
                            </TrackPage>
                        }
                    />
                    {allowPasswordAuthentication && (
                        <Tab
                            id="password"
                            title="Password"
                            panel={
                                <TrackPage
                                    name={PageName.PASSWORD_SETTINGS}
                                    type={PageType.MODAL}
                                    category={CategoryName.SETTINGS}
                                >
                                    <PasswordPanel />
                                </TrackPage>
                            }
                        />
                    )}
                    {user.data?.ability?.can('manage', 'Organization') && (
                        <Tab
                            id="organization"
                            title="Organization"
                            panel={
                                <TrackPage
                                    name={PageName.ORGANIZATION_SETTINGS}
                                    type={PageType.MODAL}
                                    category={CategoryName.SETTINGS}
                                >
                                    <OrganisationPanel />
                                </TrackPage>
                            }
                        />
                    )}
                    {user.data?.ability?.can(
                        'view',
                        'OrganizationMemberProfile',
                    ) && (
                        <Tab
                            id="userManagement"
                            title="User management"
                            panel={
                                <TrackPage
                                    name={PageName.USER_MANAGEMENT_SETTINGS}
                                    type={PageType.MODAL}
                                    category={CategoryName.SETTINGS}
                                >
                                    <UserManagementPanel
                                        {...panelProps.userManagementProps}
                                    />
                                </TrackPage>
                            }
                        />
                    )}
                    {orgData &&
                        !orgData.needsProject &&
                        user.data?.ability?.can('manage', 'Project') && (
                            <Tab
                                id="projectManagement"
                                title="Project management"
                                panel={
                                    <TrackPage
                                        name={
                                            PageName.PROJECT_MANAGEMENT_SETTINGS
                                        }
                                        type={PageType.MODAL}
                                        category={CategoryName.SETTINGS}
                                    >
                                        <ProjectManagementPanel />
                                    </TrackPage>
                                }
                            />
                        )}
                    {health.data?.auth.google.oauth2ClientId && (
                        <Tab
                            id="socialLogins"
                            title="Social logins"
                            panel={
                                <TrackPage
                                    name={PageName.PASSWORD_SETTINGS}
                                    type={PageType.MODAL}
                                    category={CategoryName.SETTINGS}
                                >
                                    <SocialLoginsPanel />
                                </TrackPage>
                            }
                        />
                    )}
                    {orgData &&
                        !orgData.needsProject &&
                        user.data?.ability?.can('manage', 'Project') && (
                            <Tab
                                id="appearance"
                                title="Appearance"
                                panel={
                                    <TrackPage
                                        name={PageName.APPEARANCE}
                                        type={PageType.MODAL}
                                        category={CategoryName.SETTINGS}
                                    >
                                        <AppearancePanel />
                                    </TrackPage>
                                }
                            />
                        )}
                    {orgData && (
                        <Tab
                            id="access-token"
                            title="Personal access tokens"
                            panel={
                                <TrackPage
                                    name={PageName.ACCESS_TOKENS}
                                    type={PageType.MODAL}
                                    category={CategoryName.SETTINGS}
                                >
                                    <AccessTokensPanel />
                                </TrackPage>
                            }
                        />
                    )}
                    <Tabs.Expander />
                </Tabs>
            </div>
        </Dialog>
    );
};

export default UserSettingsModal;
