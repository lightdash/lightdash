import { type RoleLevel, type RoleWithScopes } from '@lightdash/common';
import { Badge, Group, Stack, Tabs, Text } from '@mantine-8/core';
import { IconBuilding, IconFolder, IconIdBadge2 } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsEmptyState } from '../../../components/common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import PageSpinner from '../../../components/PageSpinner';
import { AddRoleButton } from '../../features/customRoles/components/AddRoleButton';
import { CustomRolesTable } from '../../features/customRoles/CustomRolesTable';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';
import classes from './CustomRoles.module.css';

export const CustomRoles = () => {
    const navigate = useNavigate();
    const { listRoles, deleteRole } = useCustomRoles();
    const [level, setLevel] = useState<RoleLevel>('project');

    const handleEditRole = (role: RoleWithScopes) => {
        void navigate(`/generalSettings/customRoles/${role.roleUuid}`);
    };

    const handleDeleteRole = (uuid: string) => {
        deleteRole.mutate(uuid);
    };

    // Sort roles alphabetically (case-insensitive) so the table stays
    // stable as new roles get added — the API returns insertion order
    // by default which gets noisy with many roles.
    const sortedRoles = useMemo(
        () =>
            (listRoles.data ?? []).slice().sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                    sensitivity: 'base',
                }),
            ),
        [listRoles.data],
    );

    const projectRoles = useMemo(
        () => sortedRoles.filter((role) => role.level === 'project'),
        [sortedRoles],
    );
    const organizationRoles = useMemo(
        () => sortedRoles.filter((role) => role.level === 'organization'),
        [sortedRoles],
    );

    if (listRoles.isLoading) {
        return <PageSpinner />;
    }

    const hasRoles = sortedRoles.length > 0;

    const renderRolesTable = (roles: RoleWithScopes[], level: RoleLevel) =>
        roles.length > 0 ? (
            <CustomRolesTable
                roles={roles}
                onDelete={handleDeleteRole}
                onEdit={handleEditRole}
                isDeleting={deleteRole.isLoading}
            />
        ) : (
            <Text c="dimmed" fz="sm">
                {level === 'organization'
                    ? 'No organization roles yet.'
                    : 'No project roles yet.'}
            </Text>
        );

    return (
        <SettingsPage
            title="Custom roles"
            description="Create reusable permission sets for users, groups, and service accounts."
            actions={hasRoles ? <AddRoleButton size="xs" /> : null}
        >
            {hasRoles ? (
                <Stack gap="md">
                    <Tabs
                        keepMounted={false}
                        value={level}
                        onChange={(value) => setLevel(value as RoleLevel)}
                        variant="pills"
                        classNames={{
                            list: classes.tabsList,
                            tab: classes.tab,
                            panel: classes.panel,
                        }}
                    >
                        <Tabs.List>
                            <Tabs.Tab
                                value="project"
                                leftSection={
                                    <MantineIcon icon={IconFolder} size="sm" />
                                }
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <Text span inherit>
                                        Project
                                    </Text>
                                    <Badge
                                        className={classes.tabBadge}
                                        variant="light"
                                        radius="sm"
                                    >
                                        {projectRoles.length}
                                    </Badge>
                                </Group>
                            </Tabs.Tab>
                            <Tabs.Tab
                                value="organization"
                                leftSection={
                                    <MantineIcon
                                        icon={IconBuilding}
                                        size="sm"
                                    />
                                }
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <Text span inherit>
                                        Organization
                                    </Text>
                                    <Badge
                                        className={classes.tabBadge}
                                        variant="light"
                                        radius="sm"
                                    >
                                        {organizationRoles.length}
                                    </Badge>
                                </Group>
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="project">
                            {renderRolesTable(projectRoles, 'project')}
                        </Tabs.Panel>
                        <Tabs.Panel value="organization">
                            {renderRolesTable(
                                organizationRoles,
                                'organization',
                            )}
                        </Tabs.Panel>
                    </Tabs>
                </Stack>
            ) : (
                <SettingsEmptyState
                    icon={IconIdBadge2}
                    title="No custom roles"
                    description="Create a role to define reusable organization or project permissions."
                >
                    <AddRoleButton size="md" />
                </SettingsEmptyState>
            )}
        </SettingsPage>
    );
};
