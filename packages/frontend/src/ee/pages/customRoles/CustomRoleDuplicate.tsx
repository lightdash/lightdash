import { type RoleLevel, type RoleWithScopes } from '@lightdash/common';
import { Select } from '@mantine/core';
import { startCase } from 'es-toolkit/compat';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import { SettingsSection } from '../../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import { RoleBuilder } from '../../features/customRoles/components/RoleBuilder';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';

export const CustomRoleDuplicate = () => {
    const navigate = useNavigate();
    const { createRole, getAllRoles } = useCustomRoles();
    const [sourceRoleId, setSourceRoleId] = useState('');

    const roles = useMemo<RoleWithScopes[]>(
        () => getAllRoles.data ?? [],
        [getAllRoles.data],
    );

    const rolesSelectData = useMemo(() => {
        const systemRoles = roles
            .filter((role) => role.ownerType === 'system')
            .map((role) => ({
                value: role.roleUuid,
                label: startCase(role.name),
            }));

        const customRoles = roles
            .filter((role) => role.ownerType === 'user')
            .map((role) => ({
                value: role.roleUuid,
                label: role.name,
            }));

        return [
            { group: 'System roles', items: systemRoles },
            { group: 'Custom roles', items: customRoles },
        ];
    }, [roles]);

    const sourceRole =
        roles.find((role) => role.roleUuid === sourceRoleId) ?? null;
    const isCustomSource = sourceRole?.ownerType === 'user';

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

    if (getAllRoles.isLoading) {
        return <EmptyStateLoader title="Loading roles" />;
    }

    return (
        <SettingsPage
            fillHeight
            title="Duplicate role"
            description="Start a new role from an existing role's type and permissions."
            breadcrumbs={[
                {
                    title: 'Custom roles',
                    to: '/generalSettings/customRoles',
                },
            ]}
        >
            <SettingsSection label="Source role" description={null}>
                <SettingsCard>
                    <Select
                        label="Select role to duplicate"
                        placeholder="Choose a role"
                        searchable
                        nothingFoundMessage="No roles found"
                        data={rolesSelectData}
                        required
                        value={sourceRoleId}
                        onChange={(value) => setSourceRoleId(value ?? '')}
                    />
                </SettingsCard>
            </SettingsSection>

            {sourceRole && (
                <RoleBuilder
                    key={sourceRole.roleUuid}
                    initialValues={{
                        name: `Copy of: ${sourceRole.name}`,
                        description: sourceRole.description ?? '',
                        level: sourceRole.level,
                        scopes: sourceRole.scopes,
                    }}
                    onSubmit={handleCreateRole}
                    isWorking={createRole.isLoading}
                    mode="create"
                    levelLocked={isCustomSource}
                    levelLockedHint="Type matches the role being duplicated and cannot be changed."
                    rederiveScopesOnLevelChange
                />
            )}
        </SettingsPage>
    );
};
