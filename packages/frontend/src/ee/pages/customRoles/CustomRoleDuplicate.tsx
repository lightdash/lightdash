import { type RoleLevel, type RoleWithScopes } from '@lightdash/common';
import { Center, Loader, Select, Stack } from '@mantine/core';
import startCase from 'lodash/startCase';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import PageBreadcrumbs from '../../../components/common/PageBreadcrumbs';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
import { RoleBuilder } from '../../features/customRoles/components/RoleBuilder';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';

export const CustomRoleDuplicate = () => {
    const { t } = useTranslation('customRoles');
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
            { group: t('duplicate.systemRoles'), items: systemRoles },
            { group: t('duplicate.customRoles'), items: customRoles },
        ];
    }, [roles, t]);

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
                        title: t('page.title'),
                        to: '/generalSettings/customRoles',
                    },
                    {
                        title: t('duplicate.title'),
                        active: true,
                    },
                ]}
            />

            <SettingsCard>
                <Select
                    label={t('duplicate.selectLabel')}
                    placeholder={t('duplicate.selectPlaceholder')}
                    searchable
                    nothingFoundMessage={t('duplicate.noRoles')}
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
                        name: t('duplicate.copyOf', { name: sourceRole.name }),
                        description: sourceRole.description ?? '',
                        level: sourceRole.level,
                        scopes: sourceRole.scopes,
                    }}
                    onSubmit={handleCreateRole}
                    isWorking={createRole.isLoading}
                    mode="create"
                    levelLocked={isCustomSource}
                    levelLockedHint={t('duplicate.levelLockedHint')}
                    rederiveScopesOnLevelChange
                />
            )}
        </Stack>
    );
};
