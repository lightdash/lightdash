import { Stack } from '@mantine-8/core';
import { useNavigate } from 'react-router';
import PageBreadcrumbs from '../../../components/common/PageBreadcrumbs';
import { RoleBuilder } from '../../features/customRoles/components/RoleBuilder';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';

export const CustomRoleCreate = () => {
    const navigate = useNavigate();
    const { createRole } = useCustomRoles();

    const handleCreateRole = async (values: {
        name: string;
        description: string;
        scopes: string[];
    }) => {
        await createRole.mutateAsync({
            name: values.name,
            description: values.description || undefined,
            scopes: values.scopes,
        });
        void navigate('/generalSettings/customRoles');
    };

    const initialValues = {
        name: '',
        description: '',
        scopes: [],
    };

    return (
        <Stack gap="md" h="100%">
            <PageBreadcrumbs
                items={[
                    {
                        title: 'Custom roles',
                        to: '/generalSettings/customRoles',
                    },
                    {
                        title: 'Create custom role',
                        active: true,
                    },
                ]}
            />

            <RoleBuilder
                initialValues={initialValues}
                onSubmit={handleCreateRole}
                isWorking={createRole.isLoading}
                mode="create"
            />
        </Stack>
    );
};
