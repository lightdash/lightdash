import React, { FC } from 'react';
import { Tabs, Tab, Dialog } from '@blueprintjs/core';
import './UserSettingsModal.css';
import ProfilePanel from './ProfilePanel';
import PasswordPanel from './PasswordPanel';
import OrganizationPanel from './OrganizationPanel';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const UserSettingsModal: FC<Props> = ({ isOpen, onClose }) => (
    <Dialog
        isOpen={isOpen}
        icon="cog"
        onClose={onClose}
        title="Settings"
        lazy
        canOutsideClickClose={false}
        style={{ paddingBottom: 0, minWidth: 700, minHeight: 500 }}
    >
        <div
            className="user-settings"
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        >
            <Tabs
                id="user-settings"
                renderActiveTabPanelOnly
                vertical
                animate={false}
            >
                <Tab id="profile" title="Profile" panel={<ProfilePanel />} />
                <Tab id="password" title="Password" panel={<PasswordPanel />} />
                <Tab
                    id="organization"
                    title="Organization"
                    panel={<OrganizationPanel />}
                />
                <Tabs.Expander />
            </Tabs>
        </div>
    </Dialog>
);

export default UserSettingsModal;
