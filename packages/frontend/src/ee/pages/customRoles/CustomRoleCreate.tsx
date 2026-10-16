import { rolePresets, type RoleLevel } from '@lightdash/common';
import { Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import PageBreadcrumbs from '../../../components/common/PageBreadcrumbs';
import { RoleBuilder } from '../../features/customRoles/components/RoleBuilder';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';

export const CustomRoleCreate = () => {
    const { t } = useTranslation('customRoles');
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
        <Stack gap="md" h="100%">
            <PageBreadcrumbs
                items={[
                    {
                        title: t('page.title'),
                        to: '/generalSettings/customRoles',
                    },
                    {
                        title: t('page.createTitle'),
                        active: true,
                    },
                ]}
            />

            <RoleBuilder
                initialValues={initialValues}
                onSubmit={handleCreateRole}
                isWorking={createRole.isLoading}
                mode="create"
                presets={rolePresets}
            />
        </Stack>
    );
};
