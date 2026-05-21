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
    Title,
} from '@mantine-8/core';
import {
    IconCheck,
    IconDots,
    IconPencil,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
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
}> = ({ design, onOpenDetail, onSetDefault, onDelete, settingDefault }) => (
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
                            variant="light"
                            leftSection={
                                <MantineIcon icon={IconCheck} size={12} />
                            }
                        >
                            Default
                        </Badge>
                    )}
                </Group>
                {design.description && (
                    <Text size="xs" c="ldGray.6" lineClamp={2}>
                        {design.description}
                    </Text>
                )}
            </Stack>
        </Table.Td>
        <Table.Td>
            <Text fz="sm" c="ldGray.6">
                {design.files.length}{' '}
                {design.files.length === 1 ? 'file' : 'files'}
            </Text>
        </Table.Td>
        <Table.Td w="1%">
            <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                    <ActionIcon
                        variant="transparent"
                        size="sm"
                        color="ldGray.6"
                        aria-label="More actions"
                    >
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconPencil} />}
                        onClick={onOpenDetail}
                    >
                        Edit
                    </Menu.Item>
                    <Menu.Item
                        disabled={design.isDefault || settingDefault}
                        leftSection={<MantineIcon icon={IconCheck} />}
                        onClick={onSetDefault}
                    >
                        Set as default
                    </Menu.Item>
                    <Menu.Item
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={onDelete}
                    >
                        Delete
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
        </Table.Td>
    </Table.Tr>
);

const DesignListPage: FC = () => {
    const { cx, classes } = useTableStyles();
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
        <Stack gap="sm">
            <Group gap="xxs">
                <Title order={5}>Themes</Title>
            </Group>
            <SettingsCard mb="lg">
                <Stack gap="md">
                    <Group justify="space-between">
                        <Text size="sm" c="ldGray.6">
                            Shared brand assets — CSS, fonts, images, and design
                            instructions — that can be used when building data
                            apps. New apps will automatically use the default
                            theme.
                        </Text>
                        {canManage && (
                            <Button
                                leftSection={<MantineIcon icon={IconPlus} />}
                                variant="default"
                                size="xs"
                                onClick={() => setCreateOpen(true)}
                                style={{ alignSelf: 'flex-end' }}
                            >
                                New theme
                            </Button>
                        )}
                    </Group>

                    {isInitialLoading ? (
                        <Stack gap="xs">
                            <Skeleton height={48} />
                            <Skeleton height={48} />
                        </Stack>
                    ) : designs.length === 0 ? null : (
                        <Paper withBorder style={{ overflow: 'hidden' }}>
                            <Table
                                className={cx(
                                    classes.root,
                                    classes.alignLastTdRight,
                                )}
                            >
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th w={500}>Theme</Table.Th>
                                        <Table.Th>Files</Table.Th>
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
                                                setDefault.mutate(
                                                    design.designUuid,
                                                )
                                            }
                                            onDelete={() =>
                                                setDesignToDelete(design)
                                            }
                                            settingDefault={
                                                setDefault.isLoading
                                            }
                                        />
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Paper>
                    )}
                </Stack>
            </SettingsCard>

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
                title="Edit theme"
                size="xl"
                cancelLabel={false}
                onConfirm={() => setActiveDetailUuid(null)}
                confirmLabel="Done"
            >
                {activeDetailUuid !== null && (
                    <DesignDetailPanel designUuid={activeDetailUuid} />
                )}
            </MantineModal>
        </Stack>
    );
};

export default DesignListPage;
