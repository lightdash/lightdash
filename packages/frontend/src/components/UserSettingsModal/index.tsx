import { Dialog, Tab, Tabs } from '@blueprintjs/core';
import React, { FC } from 'react';
import useLocationChange from '../../hooks/useLocationChange';
import { useApp } from '../../providers/AppProvider';
import { TrackPage } from '../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../types/Events';
import InvitesPanel from './InvitesPanel';
import OrganizationPanel from './OrganizationPanel';
import PasswordPanel from './PasswordPanel';
import ProfilePanel from './ProfilePanel';
import ProjectManagementPanel from './ProjectManagementPanel';
import SocialLoginsPanel from './SocialLoginsPanel';
import UserManagementPanel from './UserManagementPanel';
import './UserSettingsModal.css';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const UserSettingsModal: FC<Props> = ({ isOpen, onClose }) => {
    const { user, health } = useApp();
    const allowPasswordAuthentication =
        !health.data?.auth.disablePasswordAuthentication;
    useLocationChange(onClose);

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
                                    <OrganizationPanel />
                                </TrackPage>
                            }
                        />
                    )}
                    {user.data?.ability?.can('manage', 'InviteLink') && (
                        <Tab
                            id="invites"
                            title="Invites"
                            panel={
                                <TrackPage
                                    name={PageName.INVITE_MANAGEMENT_SETTINGS}
                                    type={PageType.MODAL}
                                    category={CategoryName.SETTINGS}
                                >
                                    <InvitesPanel />
                                </TrackPage>
                            }
                        />
                    )}

                    {user.data?.ability?.can(
                        'manage',
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
                                    <UserManagementPanel />
                                </TrackPage>
                            }
                        />
                    )}
                    {health.data &&
                        !health.data.needsProject &&
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
                    <Tabs.Expander />
                </Tabs>
            </div>
        </Dialog>
    );
};

export default UserSettingsModal;
