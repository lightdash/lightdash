import { Button, Group, Stack, Title } from '@mantine/core';
import { IconIdBadge2, IconPlus } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router';

import { type RoleWithScopes } from '@lightdash/common';
import { EmptyState } from '../../../components/common/EmptyState';
import MantineIcon from '../../../components/common/MantineIcon';
import PageSpinner from '../../../components/PageSpinner';
import { CustomRolesTable } from '../../features/customRoles/CustomRolesTable';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';

export const CustomRoles = () => {
    const navigate = useNavigate();
    const { listRoles, deleteRole } = useCustomRoles();

    const handleEditRole = (role: RoleWithScopes) => {
        void navigate(`/generalSettings/customRoles/${role.roleUuid}`);
    };

    const handleDeleteRole = (uuid: string) => {
        deleteRole.mutate(uuid);
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
                        <Button
                            component={Link}
                            to="/generalSettings/customRoles/create"
                            size="xs"
                            leftIcon={<MantineIcon icon={IconPlus} />}
                        >
                            Create new role
                        </Button>
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
        </Stack>
    );
};
