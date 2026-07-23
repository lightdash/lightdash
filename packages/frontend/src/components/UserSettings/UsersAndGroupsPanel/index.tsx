import { FeatureFlags, type GroupWithMembers } from '@lightdash/common';
import { Button, Tabs } from '@mantine-8/core';
import { IconPlus, IconUsers, IconUsersGroup } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import {
    SettingsPage,
    SettingsPageActions,
    SettingsPageDocumentationLink,
} from '../../common/Settings/SettingsPage';
import ForbiddenPanel from '../../ForbiddenPanel';
import CreateGroupModal from './CreateGroupModal';
import GroupsView from './GroupsView';
import InvitesModal from './InvitesModal';
import classes from './UsersAndGroupsPanel.module.css';
import UsersView from './UsersView';

const UsersAndGroupsPanel: FC = () => {
    const { user } = useApp();
    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
    const [showCreateAndEditGroupModal, setShowCreateAndEditGroupModal] =
        useState(false);
    const [groupToEdit, setGroupToEdit] = useState<
        GroupWithMembers | undefined
    >();

    if (!user.data) return null;

    if (user.data.ability.cannot('view', 'OrganizationMemberProfile')) {
        return <ForbiddenPanel />;
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.data?.enabled ?? false;

    const title = isGroupManagementEnabled
        ? 'Users & groups'
        : 'User management';
    const canInvite = user.data.ability.can('create', 'InviteLink');
    const canManageGroups = user.data.ability.can('manage', 'Group');

    const closeGroupModal = () => {
        setShowCreateAndEditGroupModal(false);
        setGroupToEdit(undefined);
    };

    return (
        <SettingsPage
            title={title}
            description="Manage organization members, roles, and group membership."
            actions={
                <SettingsPageActions>
                    <SettingsPageDocumentationLink
                        href="https://docs.lightdash.com/references/roles"
                        label="Roles documentation"
                    />
                    {activeTab === 'users' && canInvite ? (
                        <Button
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={() => setShowInviteModal(true)}
                        >
                            Add user
                        </Button>
                    ) : null}
                    {activeTab === 'groups' && canManageGroups ? (
                        <Button
                            size="xs"
                            leftSection={<MantineIcon icon={IconPlus} />}
                            onClick={() => setShowCreateAndEditGroupModal(true)}
                        >
                            Add group
                        </Button>
                    ) : null}
                </SettingsPageActions>
            }
        >
            <Tabs
                keepMounted={false}
                value={activeTab}
                onChange={(value) => {
                    if (value === 'users' || value === 'groups') {
                        setActiveTab(value);
                    }
                }}
                variant="pills"
                classNames={{
                    list: classes.tabsList,
                    tab: classes.tab,
                    panel: classes.panel,
                }}
            >
                {isGroupManagementEnabled && (
                    <Tabs.List>
                        <Tabs.Tab
                            value="users"
                            leftSection={<MantineIcon icon={IconUsers} />}
                        >
                            Users
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="groups"
                            leftSection={<MantineIcon icon={IconUsersGroup} />}
                        >
                            Groups
                        </Tabs.Tab>
                    </Tabs.List>
                )}
                <Tabs.Panel value="users">
                    <UsersView />
                </Tabs.Panel>
                <Tabs.Panel value="groups">
                    <GroupsView
                        onEditGroup={(group) => {
                            setGroupToEdit(group);
                            setShowCreateAndEditGroupModal(true);
                        }}
                    />
                </Tabs.Panel>
            </Tabs>

            <InvitesModal
                key={`invite-modal-${showInviteModal}`}
                opened={showInviteModal}
                onClose={() => setShowInviteModal(false)}
            />
            {showCreateAndEditGroupModal ? (
                <CreateGroupModal
                    key={`create-group-modal-${showCreateAndEditGroupModal}`}
                    opened={showCreateAndEditGroupModal}
                    onClose={closeGroupModal}
                    groupToEdit={groupToEdit}
                    isEditing={groupToEdit !== undefined}
                />
            ) : null}
        </SettingsPage>
    );
};

export default UsersAndGroupsPanel;
