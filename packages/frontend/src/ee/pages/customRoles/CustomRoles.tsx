import { type RoleWithScopes } from '@lightdash/common';
import { Group, Stack } from '@mantine-8/core';
import { IconIdBadge2 } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';
import PageBreadcrumbs from '../../../components/common/PageBreadcrumbs';
import PageSpinner from '../../../components/PageSpinner';
import { AddRoleButton } from '../../features/customRoles/components/AddRoleButton';
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
                <>
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
