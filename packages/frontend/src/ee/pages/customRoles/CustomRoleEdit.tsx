import { Center, Loader, Stack } from '@mantine-8/core';
import { useNavigate, useParams } from 'react-router';
import PageBreadcrumbs from '../../../components/common/PageBreadcrumbs';
import { RoleBuilder } from '../../features/customRoles/components/RoleBuilder';
import { useCustomRole } from '../../features/customRoles/useCustomRole';

export const CustomRoleEdit = () => {
    const navigate = useNavigate();
    const { roleId } = useParams<{ roleId: string }>();
    const {
        data: role,
        isLoading: isLoadingRole,
        updateRole,
    } = useCustomRole(roleId);

    const handleUpdateRole = async (values: {
        name: string;
        description: string;
        scopes: string[];
    }) => {
        if (!roleId || !role) return;

        const originalScopes = new Set(role.scopes);
        const newScopes = new Set(values.scopes);

        const scopesToAdd = values.scopes.filter(
            (scope) => !originalScopes.has(scope),
        );
        const scopesToRemove = role.scopes.filter(
            (scope) => !newScopes.has(scope),
        );

        await updateRole.mutateAsync({
            roleUuid: roleId,
            data: {
                name: values.name,
                description: values.description,
                scopes: {
                    add: scopesToAdd,
                    remove: scopesToRemove,
                },
            },
        });
        void navigate('/generalSettings/customRoles');
    };

    if (isLoadingRole) {
        return (
            <Center h="100vh">
                <Loader />
            </Center>
        );
    }

    if (!role) {
        void navigate('/generalSettings/customRoles');
        return;
    }

    return (
        <Stack gap="md" h="100%">
            <PageBreadcrumbs
                items={[
                    {
                        title: 'Custom roles',
                        to: '/generalSettings/customRoles',
                    },
                    {
                        title: role.name,
                        active: true,
                    },
                ]}
            />

            <RoleBuilder
                initialValues={{
                    name: role.name,
                    description: role.description || '',
                    scopes: role.scopes || [],
                }}
                onSubmit={handleUpdateRole}
                isWorking={updateRole.isLoading}
                mode="edit"
            />
        </Stack>
    );
};
