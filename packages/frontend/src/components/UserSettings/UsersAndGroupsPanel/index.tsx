import { ActionIcon, Group, Stack, Tabs, Title, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { FC } from 'react';
import { useApp } from '../../../providers/AppProvider';

import MantineIcon from '../../common/MantineIcon';
import ForbiddenPanel from '../../ForbiddenPanel';

import GroupsView from './GroupsView';
import UsersView from './UsersView';

const UsersAndGroupsPanel: FC = () => {
    // TODO: this is a feature flag while we are building groups.
    // Remove this when groups are ready to be released.
    const groupManagementEnabled = useFeatureFlagEnabled('group-management');
    const { user } = useApp();

    if (user.data?.ability.cannot('view', 'OrganizationMemberProfile')) {
        return <ForbiddenPanel />;
    }

    return (
        <Stack spacing="sm">
            <Group spacing="two">
                {groupManagementEnabled ? (
                    <Title order={5}>Users and groups</Title>
                ) : (
                    <Title order={5}>User management settings</Title>
                )}
                <Tooltip label="Click here to learn more about user roles">
                    <ActionIcon
                        component="a"
                        href="https://docs.lightdash.com/references/roles"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Tabs defaultValue={'users'}>
                {groupManagementEnabled && (
                    <Tabs.List mb="xs">
                        <Tabs.Tab value="users">Users</Tabs.Tab>
                        <Tabs.Tab value="groups">Groups</Tabs.Tab>
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
