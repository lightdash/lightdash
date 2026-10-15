import { type ApiOrganizationDesign } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Menu,
    Paper,
    Skeleton,
    Stack,
    Table,
    Text,
} from '@mantine/core';
import {
    IconCheck,
    IconDots,
    IconPalette,
    IconPencil,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
import { SettingsEmptyState } from '../../../components/common/Settings/SettingsEmptyState';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import tableStyles from '../../../hooks/styles/tableStyles.module.css';
import useApp from '../../../providers/App/useApp';
import {
    useDeleteOrganizationDesign,
    useOrganizationDesigns,
    useSetDefaultOrganizationDesign,
} from '../hooks/useOrganizationDesigns';
import { CreateDesignModal } from './CreateDesignModal';
import { DeleteDesignModal } from './DeleteDesignModal';
import { DesignDetailPanel } from './DesignDetailPanel';

const DesignRow: FC<{
    design: ApiOrganizationDesign;
    onOpenDetail: () => void;
    onSetDefault: () => void;
    onDelete: () => void;
    settingDefault: boolean;
}> = ({ design, onOpenDetail, onSetDefault, onDelete, settingDefault }) => {
    const { t } = useTranslation('settings');
    return (
        <Table.Tr>
            <Table.Td>
                <Stack gap="xxs" align="flex-start">
                    <Group gap="xs" wrap="nowrap">
                        <Text fw={600} fz="sm">
                            {design.name}
                        </Text>
                        {design.isDefault && (
                            <Badge
                                color="blue"
                                leftSection={
                                    <MantineIcon icon={IconCheck} size={12} />
                                }
                            >
                                {t('designs.row.default')}
                            </Badge>
                        )}
                    </Group>
                    {design.description && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                            {design.description}
                        </Text>
                    )}
                </Stack>
            </Table.Td>
            <Table.Td>
                <Text fz="sm" c="dimmed">
                    {t('designs.row.fileCount', {
                        count: design.files.length,
                    })}
                </Text>
            </Table.Td>
            <Table.Td w="1%">
                <Menu position="bottom-end">
                    <Menu.Target>
                        <ActionIcon
                            variant="transparent"
                            size="sm"
                            aria-label={t('designs.row.moreActions')}
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item
                            leftSection={<MantineIcon icon={IconPencil} />}
                            onClick={onOpenDetail}
                        >
                            {t('designs.row.edit')}
                        </Menu.Item>
                        <Menu.Item
                            disabled={design.isDefault || settingDefault}
                            leftSection={<MantineIcon icon={IconCheck} />}
                            onClick={onSetDefault}
                        >
                            {t('designs.row.setAsDefault')}
                        </Menu.Item>
                        <Menu.Item
                            color="red"
                            leftSection={<MantineIcon icon={IconTrash} />}
                            onClick={onDelete}
                        >
                            {t('designs.row.delete')}
                        </Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Table.Td>
        </Table.Tr>
    );
};

const DesignListPage: FC = () => {
    const { t } = useTranslation('settings');
    const {
        user: { data: user },
    } = useApp();
    const canManage =
        user?.ability?.can('manage', 'OrganizationDesign') ?? false;

    const { data: designs = [], isInitialLoading } = useOrganizationDesigns();
    const setDefault = useSetDefaultOrganizationDesign();
    const deleteDesign = useDeleteOrganizationDesign();

    const [createOpen, setCreateOpen] = useState(false);
    const [activeDetailUuid, setActiveDetailUuid] = useState<string | null>(
        null,
    );
    const [designToDelete, setDesignToDelete] =
        useState<ApiOrganizationDesign | null>(null);

    return (
        <SettingsPage
            title={t('designs.list.title')}
            description={t('designs.list.description')}
            actions={
                canManage ? (
                    <Button
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        variant="default"
                        onClick={() => setCreateOpen(true)}
                    >
                        {t('designs.list.newTheme')}
                    </Button>
                ) : null
            }
        >
            {isInitialLoading ? (
                <SettingsCard>
                    <Stack gap="xs">
                        <Skeleton height={48} />
                        <Skeleton height={48} />
                    </Stack>
                </SettingsCard>
            ) : designs.length === 0 ? (
                <SettingsEmptyState
                    icon={IconPalette}
                    title={t('designs.list.emptyTitle')}
                    description={t('designs.list.emptyDescription')}
                />
            ) : (
                <SettingsCard>
                    <Paper>
                        <Table
                            className={`${tableStyles.root} ${tableStyles.alignLastTdRight}`}
                        >
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th w={500}>
                                        {t('designs.list.columnTheme')}
                                    </Table.Th>
                                    <Table.Th>
                                        {t('designs.list.columnFiles')}
                                    </Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {designs.map((design) => (
                                    <DesignRow
                                        key={design.designUuid}
                                        design={design}
                                        onOpenDetail={() =>
                                            setActiveDetailUuid(
                                                design.designUuid,
                                            )
                                        }
                                        onSetDefault={() =>
                                            setDefault.mutate(design.designUuid)
                                        }
                                        onDelete={() =>
                                            setDesignToDelete(design)
                                        }
                                        settingDefault={setDefault.isLoading}
                                    />
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Paper>
                </SettingsCard>
            )}

            <CreateDesignModal
                opened={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={(created) => {
                    setCreateOpen(false);
                    setActiveDetailUuid(created.designUuid);
                }}
            />

            <DeleteDesignModal
                design={designToDelete}
                opened={designToDelete !== null}
                isDeleting={deleteDesign.isLoading}
                onClose={() => setDesignToDelete(null)}
                onConfirm={() => {
                    if (!designToDelete) return;
                    deleteDesign.mutate(designToDelete.designUuid, {
                        onSuccess: () => setDesignToDelete(null),
                    });
                }}
            />

            <MantineModal
                opened={activeDetailUuid !== null}
                onClose={() => setActiveDetailUuid(null)}
                title={t('designs.list.editTheme')}
                size="xl"
                cancelLabel={false}
                onConfirm={() => setActiveDetailUuid(null)}
                confirmLabel={t('designs.list.done')}
            >
                {activeDetailUuid !== null && (
                    <DesignDetailPanel designUuid={activeDetailUuid} />
                )}
            </MantineModal>
        </SettingsPage>
    );
};

export default DesignListPage;
