import { Dialog, Tab, Tabs } from '@blueprintjs/core';
import React, { FC } from 'react';
import useLocationChange from '../../hooks/useLocationChange';
import { TrackPage } from '../../providers/TrackingProvider';
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
                            <TrackPage
                                name={PageName.PROFILE_SETTINGS}
                                type={PageType.MODAL}
                                category={CategoryName.SETTINGS}
                            >
                                <ProfilePanel />
                            </TrackPage>
                        }
                    />
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
                    <Tab
                        id="projectManagement"
                        title="Project management"
                        panel={
                            <TrackPage
                                name={PageName.PROJECT_MANAGEMENT_SETTINGS}
                                type={PageType.MODAL}
                                category={CategoryName.SETTINGS}
                            >
                                <ProjectManagementPanel />
                            </TrackPage>
                        }
                    />
                    <Tabs.Expander />
                </Tabs>
            </div>
        </Dialog>
    );
};

export default UserSettingsModal;
