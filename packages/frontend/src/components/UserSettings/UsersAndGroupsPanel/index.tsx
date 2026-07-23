import { FeatureFlags } from '@lightdash/common';
import { ActionIcon, Tabs, Tooltip } from '@mantine-8/core';
import { IconInfoCircle, IconUsers, IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { SettingsPage } from '../../common/Settings/SettingsPage';
import ForbiddenPanel from '../../ForbiddenPanel';
import GroupsView from './GroupsView';
import classes from './UsersAndGroupsPanel.module.css';
import UsersView from './UsersView';

const UsersAndGroupsPanel: FC = () => {
    const { user } = useApp();
    const userGroupsFeatureFlagQuery = useServerFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    if (!user.data) return null;

    if (user.data.ability.cannot('view', 'OrganizationMemberProfile')) {
        return <ForbiddenPanel />;
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.data?.enabled ?? false;

    const title = isGroupManagementEnabled
        ? 'Users & groups'
        : 'User management';

    return (
        <SettingsPage
            title={title}
            description="Manage organization members, roles, and group membership."
            actions={
                <Tooltip label="Learn more about user roles" position="bottom">
                    <ActionIcon
                        component="a"
                        href="https://docs.lightdash.com/references/roles"
                        target="_blank"
                        rel="noreferrer"
                        variant="subtle"
                        size="xs"
                        color="ldGray.6"
                        aria-label="Learn about user roles"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            }
        >
            <Tabs
                keepMounted={false}
                defaultValue="users"
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
                    <GroupsView />
                </Tabs.Panel>
            </Tabs>
        </SettingsPage>
    );
};

export default UsersAndGroupsPanel;
