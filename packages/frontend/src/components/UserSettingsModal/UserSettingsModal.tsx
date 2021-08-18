import React, { FC } from 'react';
import { Tabs, Tab, Dialog } from '@blueprintjs/core';
import './UserSettingsModal.css';
import ProfilePanel from './ProfilePanel';
import PasswordPanel from './PasswordPanel';
import OrganizationPanel from './OrganizationPanel';
import { useApp } from '../../providers/AppProvider';
import UserManagementPanel from './UserManagementPanel';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const UserSettingsModal: FC<Props> = ({ isOpen, onClose }) => {
    const { rudder } = useApp();
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
                    onChange={(newTabId) => {
                        rudder.page({
                            name: `${newTabId}_settings`,
                            type: 'modal',
                            category: 'settings',
                        });
                    }}
                >
                    <Tab
                        id="profile"
                        title="Profile"
                        panel={<ProfilePanel />}
                    />
                    <Tab
                        id="password"
                        title="Password"
                        panel={<PasswordPanel />}
                    />
                    <Tab
                        id="organization"
                        title="Organization"
                        panel={<OrganizationPanel />}
                    />
                    <Tab
                        id="userManagement"
                        title="User management"
                        panel={<UserManagementPanel />}
                    />
                    <Tabs.Expander />
                </Tabs>
            </div>
        </Dialog>
    );
};

export default UserSettingsModal;
