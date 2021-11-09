import { Dialog, Tab, Tabs } from '@blueprintjs/core';
import React, { FC } from 'react';
import useLocationChange from '../../hooks/useLocationChange';
import { Page } from '../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../types/Events';
import InvitesPanel from './InvitesPanel';
import OrganizationPanel from './OrganizationPanel';
import PasswordPanel from './PasswordPanel';
import ProfilePanel from './ProfilePanel';
import ProjectManagementPanel from './ProjectManagementPanel';
import UserManagementPanel from './UserManagementPanel';
import './UserSettingsModal.css';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const UserSettingsModal: FC<Props> = ({ isOpen, onClose }) => {
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
                            <Page
                                name={PageName.PROFILE_SETTINGS}
                                type={PageType.MODAL}
                                category={CategoryName.SETTINGS}
                            >
                                <ProfilePanel />
                            </Page>
                        }
                    />
                    <Tab
                        id="password"
                        title="Password"
                        panel={
                            <Page
                                name={PageName.PASSWORD_SETTINGS}
                                type={PageType.MODAL}
                                category={CategoryName.SETTINGS}
                            >
                                <PasswordPanel />
                            </Page>
                        }
                    />
                    <Tab
                        id="organization"
                        title="Organization"
                        panel={
                            <Page
                                name={PageName.ORGANIZATION_SETTINGS}
                                type={PageType.MODAL}
                                category={CategoryName.SETTINGS}
                            >
                                <OrganizationPanel />
                            </Page>
                        }
                    />
                    <Tab
                        id="invites"
                        title="Invites"
                        panel={
                            <Page
                                name={PageName.INVITE_MANAGEMENT_SETTINGS}
                                type={PageType.MODAL}
                                category={CategoryName.SETTINGS}
                            >
                                <InvitesPanel />
                            </Page>
                        }
                    />
                    <Tab
                        id="userManagement"
                        title="User management"
                        panel={
                            <Page
                                name={PageName.USER_MANAGEMENT_SETTINGS}
                                type={PageType.MODAL}
                                category={CategoryName.SETTINGS}
                            >
                                <UserManagementPanel />
                            </Page>
                        }
                    />
                    <Tab
                        id="projectManagement"
                        title="Project management"
                        panel={
                            <Page
                                name={PageName.PROJECT_MANAGEMENT_SETTINGS}
                                type={PageType.MODAL}
                                category={CategoryName.SETTINGS}
                            >
                                <ProjectManagementPanel />
                            </Page>
                        }
                    />
                    <Tabs.Expander />
                </Tabs>
            </div>
        </Dialog>
    );
};

export default UserSettingsModal;
