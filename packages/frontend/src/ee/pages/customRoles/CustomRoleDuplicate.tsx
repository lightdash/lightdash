import { type RoleLevel, type RoleWithScopes } from '@lightdash/common';
import { Center, Loader, Select, Stack } from '@mantine-8/core';
import startCase from 'lodash/startCase';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import PageBreadcrumbs from '../../../components/common/PageBreadcrumbs';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
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
        return (
            <Center h="100vh">
                <Loader />
            </Center>
        );
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
                        title: 'Duplicate role',
                        active: true,
                    },
                ]}
            />

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
                    levelLockedHint="Level matches the role being duplicated and cannot be changed."
                    rederiveScopesOnLevelChange
                />
            )}
        </Stack>
    );
};
