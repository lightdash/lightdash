import { type RoleLevel, type RoleWithScopes } from '@lightdash/common';
import { Badge, Group, Stack, Tabs, Text } from '@mantine/core';
import { IconBuilding, IconFolder, IconIdBadge2 } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsEmptyState } from '../../../components/common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import PageSpinner from '../../../components/PageSpinner';
import { AddRoleButton } from '../../features/customRoles/components/AddRoleButton';
import { CustomRolesTable } from '../../features/customRoles/CustomRolesTable';
import { useCustomRoles } from '../../features/customRoles/useCustomRoles';
import classes from './CustomRoles.module.css';

export const CustomRoles = () => {
    const { t } = useTranslation('customRoles');
    const navigate = useNavigate();
    const { listRoles, deleteRole } = useCustomRoles();
    const [level, setLevel] = useState<RoleLevel>('project');

    const handleEditRole = (role: RoleWithScopes) => {
        void navigate(`/generalSettings/customRoles/${role.roleUuid}`);
    };

    const handleDeleteRole = (uuid: string) => {
        deleteRole.mutate(uuid);
    };

    // Sort roles alphabetically (case-insensitive) so the table stays
    // stable as new roles get added — the API returns insertion order
    // by default which gets noisy with many roles.
    const sortedRoles = useMemo(
        () =>
            (listRoles.data ?? []).slice().sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                    sensitivity: 'base',
                }),
            ),
        [listRoles.data],
    );

    const projectRoles = useMemo(
        () => sortedRoles.filter((role) => role.level === 'project'),
        [sortedRoles],
    );
    const organizationRoles = useMemo(
        () => sortedRoles.filter((role) => role.level === 'organization'),
        [sortedRoles],
    );

    const hasRoles = sortedRoles.length > 0;

    const renderRolesTable = (roles: RoleWithScopes[], level: RoleLevel) =>
        roles.length > 0 ? (
            <CustomRolesTable
                roles={roles}
                onDelete={handleDeleteRole}
                onEdit={handleEditRole}
                isDeleting={deleteRole.isLoading}
            />
        ) : (
            <Text c="dimmed" fz="sm">
                {level === 'organization'
                    ? t('page.noOrganizationRoles')
                    : t('page.noProjectRoles')}
            </Text>
        );

    return (
        <SettingsPage
            title={t('page.title')}
            description={t('page.description')}
            actions={<AddRoleButton size="xs" />}
        >
            {listRoles.isLoading ? (
                <PageSpinner />
            ) : hasRoles ? (
                <Stack gap="md">
                    <Tabs
                        keepMounted={false}
                        value={level}
                        onChange={(value) => setLevel(value as RoleLevel)}
                        variant="pills"
                    >
                        <Tabs.List>
                            <Tabs.Tab
                                value="project"
                                leftSection={
                                    <MantineIcon icon={IconFolder} size="sm" />
                                }
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <Text span inherit>
                                        {t('levels.project')}
                                    </Text>
                                    <Badge className={classes.tabBadge}>
                                        {projectRoles.length}
                                    </Badge>
                                </Group>
                            </Tabs.Tab>
                            <Tabs.Tab
                                value="organization"
                                leftSection={
                                    <MantineIcon
                                        icon={IconBuilding}
                                        size="sm"
                                    />
                                }
                            >
                                <Group gap="xs" wrap="nowrap">
                                    <Text span inherit>
                                        {t('levels.organization')}
                                    </Text>
                                    <Badge className={classes.tabBadge}>
                                        {organizationRoles.length}
                                    </Badge>
                                </Group>
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="project">
                            {renderRolesTable(projectRoles, 'project')}
                        </Tabs.Panel>
                        <Tabs.Panel value="organization">
                            {renderRolesTable(
                                organizationRoles,
                                'organization',
                            )}
                        </Tabs.Panel>
                    </Tabs>
                </Stack>
            ) : (
                <SettingsEmptyState
                    icon={IconIdBadge2}
                    title={t('page.emptyTitle')}
                    description={t('page.emptyDescription')}
                />
            )}
        </SettingsPage>
    );
};
