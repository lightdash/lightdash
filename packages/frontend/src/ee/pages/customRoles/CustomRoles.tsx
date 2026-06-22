import { type RoleLevel, type RoleWithScopes } from '@lightdash/common';
import { Badge, Group, Stack, Tabs, Text } from '@mantine-8/core';
import { IconBuilding, IconFolder, IconIdBadge2 } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';
import PageBreadcrumbs from '../../../components/common/PageBreadcrumbs';
import PageSpinner from '../../../components/PageSpinner';
import { AddRoleButton } from '../../features/customRoles/components/AddRoleButton';
import { CustomRolesTable } from '../../features/customRoles/CustomRolesTable';
import { DuplicateRoleModal } from '../../features/customRoles/DuplicateRoleModal';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';
import classes from './CustomRoles.module.css';

export const CustomRoles = () => {
    const navigate = useNavigate();
    const { listRoles, deleteRole, getAllRoles, duplicateRole } =
        useCustomRoles();
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
    const [level, setLevel] = useState<RoleLevel>('project');

    const handleEditRole = (role: RoleWithScopes) => {
        void navigate(`/generalSettings/customRoles/${role.roleUuid}`);
    };

    const handleDeleteRole = (uuid: string) => {
        deleteRole.mutate(uuid);
    };

    const handleDuplicateRole = async (data: {
        roleId: string;
        name: string;
        description: string;
    }) => {
        const result = await duplicateRole.mutateAsync(data);
        setIsDuplicateModalOpen(false);
        void navigate(`/generalSettings/customRoles/${result.roleUuid}`);
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
                    ? 'No organization-level roles yet.'
                    : 'No project-level roles yet.'}
            </Text>
        );

    return (
        <Stack mb="lg" gap="md">
            <Group justify="space-between" align="flex-start">
                <PageBreadcrumbs
                    items={[
                        {
                            title: 'Custom roles',
                            active: true,
                        },
                    ]}
                />
                {hasRoles && (
                    <AddRoleButton
                        onClickDuplicate={() => setIsDuplicateModalOpen(true)}
                        size="xs"
                    />
                )}
            </Group>

            {hasRoles ? (
                <Stack gap="md">
                    <Text c="dimmed" fz="sm">
                        Roles you create here can be assigned to users, groups
                        and service accounts
                    </Text>

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
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconIdBadge2}
                            color="ldGray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title="No custom roles"
                    description="You haven't created any custom roles yet. Custom roles allow you to define specific permissions for your organization."
                >
                    <AddRoleButton
                        onClickDuplicate={() => setIsDuplicateModalOpen(true)}
                        size="md"
                    />
                </EmptyState>
            )}

            <DuplicateRoleModal
                isOpen={isDuplicateModalOpen}
                onClose={() => setIsDuplicateModalOpen(false)}
                onSubmit={handleDuplicateRole}
                isSubmitting={duplicateRole.isLoading}
                roles={getAllRoles.data || []}
            />
        </Stack>
    );
};
