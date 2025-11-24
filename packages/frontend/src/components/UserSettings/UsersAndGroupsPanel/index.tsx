import { FeatureFlags } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    Stack,
    Tabs,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { IconInfoCircle, IconUsers, IconUsersGroup } from '@tabler/icons-react';
import { type FC } from 'react';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import useApp from '../../../providers/App/useApp';
import ForbiddenPanel from '../../ForbiddenPanel';
import MantineIcon from '../../common/MantineIcon';
import GroupsView from './GroupsView';
import classes from './UsersAndGroupsPanel.module.css';
import UsersView from './UsersView';

const UsersAndGroupsPanel: FC = () => {
    const { user } = useApp();
    const userGroupsFeatureFlagQuery = useFeatureFlag(
        FeatureFlags.UserGroupsEnabled,
    );

    if (!user.data) return null;

    if (user.data.ability.cannot('view', 'OrganizationMemberProfile')) {
        return <ForbiddenPanel />;
    }

    if (userGroupsFeatureFlagQuery.isError) {
        console.error(userGroupsFeatureFlagQuery.error);
        throw new Error('Error fetching user groups feature flag');
    }

    const isGroupManagementEnabled =
        userGroupsFeatureFlagQuery.isSuccess &&
        userGroupsFeatureFlagQuery.data.enabled;

    return (
        <Stack gap="sm">
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
                <Group gap="xs" align="center" className={classes.header}>
                    <Title order={5}>
                        {isGroupManagementEnabled
                            ? 'Users and groups'
                            : 'User management settings'}
                    </Title>
                    <Tooltip
                        label="Click here to learn more about user roles"
                        position="right"
                    >
                        <ActionIcon
                            component="a"
                            href="https://docs.lightdash.com/references/roles"
                            target="_blank"
                            rel="noreferrer"
                            variant="subtle"
                            size="xs"
                            color="ldGray.6"
                        >
                            <MantineIcon icon={IconInfoCircle} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
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
        </Stack>
    );
};

export default UsersAndGroupsPanel;
