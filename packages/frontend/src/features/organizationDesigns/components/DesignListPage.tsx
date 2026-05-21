import { type ApiOrganizationDesign } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Card,
    Group,
    Menu,
    Skeleton,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconCheck,
    IconDotsVertical,
    IconPencil,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
import useApp from '../../../providers/App/useApp';
import {
    useDeleteOrganizationDesign,
    useOrganizationDesigns,
    useSetDefaultOrganizationDesign,
} from '../hooks/useOrganizationDesigns';
import { CreateDesignModal } from './CreateDesignModal';
import { DeleteDesignModal } from './DeleteDesignModal';
import { DesignDetailPanel } from './DesignDetailPanel';

const DesignCard: FC<{
    design: ApiOrganizationDesign;
    onOpenDetail: () => void;
    onSetDefault: () => void;
    onDelete: () => void;
    settingDefault: boolean;
}> = ({ design, onOpenDetail, onSetDefault, onDelete, settingDefault }) => (
    <Card withBorder padding="md" radius="sm">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs" wrap="nowrap">
                    <Text fw={600} truncate>
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
                    <Text size="sm" c="ldGray.6" lineClamp={2}>
                        {design.description}
                    </Text>
                )}
                <Text size="xs" c="ldGray.6">
                    {design.files.length}{' '}
                    {design.files.length === 1 ? 'file' : 'files'}
                </Text>
            </Stack>

            <Group gap="xs" wrap="nowrap">
                <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<MantineIcon icon={IconPencil} />}
                    onClick={onOpenDetail}
                >
                    Edit
                </Button>
                <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="More actions"
                        >
                            <MantineIcon icon={IconDotsVertical} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
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
            </Group>
        </Group>
    </Card>
);

const DesignListPage: FC = () => {
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
                            <Skeleton height={64} />
                            <Skeleton height={64} />
                        </Stack>
                    ) : designs.length === 0 ? null : (
                        <Stack gap="xs">
                            {designs.map((design) => (
                                <DesignCard
                                    key={design.designUuid}
                                    design={design}
                                    onOpenDetail={() =>
                                        setActiveDetailUuid(design.designUuid)
                                    }
                                    onSetDefault={() =>
                                        setDefault.mutate(design.designUuid)
                                    }
                                    onDelete={() => setDesignToDelete(design)}
                                    settingDefault={setDefault.isLoading}
                                />
                            ))}
                        </Stack>
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
                cancelLabel="Close"
            >
                {activeDetailUuid !== null && (
                    <DesignDetailPanel designUuid={activeDetailUuid} />
                )}
            </MantineModal>
        </Stack>
    );
};

export default DesignListPage;
