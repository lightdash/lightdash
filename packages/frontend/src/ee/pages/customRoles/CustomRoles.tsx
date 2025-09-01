import { Button, Group, Menu, Stack, Title } from '@mantine/core';
import { IconIdBadge2, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { type RoleWithScopes } from '@lightdash/common';
import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';
import PageSpinner from '../../../components/PageSpinner';
import { CustomRolesTable } from '../../features/customRoles/CustomRolesTable';
import { DuplicateRoleModal } from '../../features/customRoles/DuplicateRoleModal';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';

export const CustomRoles = () => {
    const navigate = useNavigate();
    const { listRoles, deleteRole, getAllRoles, duplicateRole } =
        useCustomRoles();
    const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);

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

    if (listRoles.isLoading) {
        return <PageSpinner />;
    }

    const hasRoles = (listRoles?.data?.length ?? 0) > 0;

    return (
        <Stack mb="lg">
            {hasRoles ? (
                <>
                    <Group position="apart">
                        <Title order={5}>Custom roles</Title>
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Button
                                    size="xs"
                                    leftIcon={<MantineIcon icon={IconPlus} />}
                                >
                                    Add role
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item
                                    component={Link}
                                    to="/generalSettings/customRoles/create"
                                >
                                    Create new role
                                </Menu.Item>
                                <Menu.Item
                                    onClick={() =>
                                        setIsDuplicateModalOpen(true)
                                    }
                                >
                                    Duplicate existing role
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                    <CustomRolesTable
                        roles={listRoles?.data ?? []}
                        onDelete={handleDeleteRole}
                        onEdit={handleEditRole}
                        isDeleting={deleteRole.isLoading}
                    />
                </>
            ) : (
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconIdBadge2}
                            color="gray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title="No custom roles"
                    description="You haven't created any custom roles yet. Custom roles allow you to define specific permissions for your organization."
                >
                    <Button
                        component={Link}
                        to="/generalSettings/customRoles/create"
                    >
                        Create custom role
                    </Button>
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
