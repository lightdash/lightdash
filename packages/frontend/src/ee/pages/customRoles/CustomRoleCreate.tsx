import { rolePresets, type RoleLevel } from '@lightdash/common';
import { useNavigate } from 'react-router';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import { RoleBuilder } from '../../features/customRoles/components/RoleBuilder';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';

export const CustomRoleCreate = () => {
    const navigate = useNavigate();
    const { createRole } = useCustomRoles();

    const handleCreateRole = async (values: {
        name: string;
        description: string;
        level: RoleLevel;
        scopes: string[];
    }) => {
        await createRole.mutateAsync({
            name: values.name,
            description: values.description || undefined,
            level: values.level,
            scopes: values.scopes,
        });
        void navigate('/generalSettings/customRoles');
    };

    const initialValues = {
        name: '',
        description: '',
        level: 'project' as const,
        scopes: [],
    };

    return (
        <SettingsPage
            fillHeight
            title="Create custom role"
            description="Choose where the role can be assigned and which permissions it grants."
            breadcrumbs={[
                {
                    title: 'Custom roles',
                    to: '/generalSettings/customRoles',
                },
            ]}
        >
            <RoleBuilder
                initialValues={initialValues}
                onSubmit={handleCreateRole}
                isWorking={createRole.isLoading}
                mode="create"
                presets={rolePresets}
            />
        </SettingsPage>
    );
};
