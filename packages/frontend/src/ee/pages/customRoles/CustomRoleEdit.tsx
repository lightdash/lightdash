import { type RoleLevel } from '@lightdash/common';
import { useNavigate, useParams } from 'react-router';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
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
        level: RoleLevel;
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
        return <EmptyStateLoader title="Loading role" />;
    }

    if (!role) {
        void navigate('/generalSettings/customRoles');
        return;
    }

    return (
        <SettingsPage
            fillHeight
            title={role.name}
            description="Edit the role's details and permissions."
            breadcrumbs={[
                {
                    title: 'Custom roles',
                    to: '/generalSettings/customRoles',
                },
            ]}
        >
            <RoleBuilder
                initialValues={{
                    name: role.name,
                    description: role.description || '',
                    level: role.level,
                    scopes: role.scopes || [],
                }}
                onSubmit={handleUpdateRole}
                isWorking={updateRole.isLoading}
                mode="edit"
            />
        </SettingsPage>
    );
};
