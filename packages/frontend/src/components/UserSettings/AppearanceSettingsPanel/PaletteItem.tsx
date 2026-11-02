import { type OrganizationColorPalette } from '@lightdash/common';
import {
    Stack,
    Group,
    Paper,
    Text,
    Button,
    ActionIcon,
    Badge,
    ColorSwatch,
    Menu,
    Tooltip,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import {
    IconDotsVertical,
    IconEdit,
    IconCopy,
    IconInfoCircle,
    IconMoon,
    IconSun,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useDeleteColorPalette } from '../../../hooks/appearance/useOrganizationAppearance';
import useToaster from '../../../hooks/toaster/useToaster';
import MantineIcon from '../../common/MantineIcon';
import { DeletePaletteModal } from './DeletePaletteModal';
import { EditPaletteModal } from './EditPaletteModal';

type PaletteItemProps = {
    palette: Omit<OrganizationColorPalette, 'name'> & { name: string };
    isActive: boolean;
    onSetActive?: ((uuid: string) => void) | undefined;
    readOnly?: boolean;
    canManage: boolean;
};

export const PaletteItem: FC<PaletteItemProps> = ({
    palette,
    isActive,
    onSetActive,
    readOnly,
    canManage,
}) => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const deleteColorPalette = useDeleteColorPalette();
    const clipboard = useClipboard({ timeout: 1000 });
    const { showToastSuccess } = useToaster();

    const handleDeletePalette = () => {
        deleteColorPalette.mutate(palette.colorPaletteUuid);
        setIsDeleteModalOpen(false);
    };

    const handleCopyUuid = useCallback(() => {
        clipboard.copy(palette.colorPaletteUuid);
        showToastSuccess({ title: 'Palette UUID copied to clipboard' });
    }, [clipboard, showToastSuccess, palette.colorPaletteUuid]);

    const hasDarkColors =
        palette.darkColors !== null && palette.darkColors !== undefined;

    return (
        <>
            <Paper p="md">
                <Group justify="space-between" align="center" gap="sm">
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            {palette.name}
                        </Text>
                        <Group gap="sm">
                            <Tooltip label="Light mode" position="top">
                                <Group gap="two">
                                    <MantineIcon
                                        icon={IconSun}
                                        size="sm"
                                        color="foreground"
                                    />
                                    {palette.colors
                                        .slice(0, 5)
                                        .map((color, index) => (
                                            <ColorSwatch
                                                key={`light-${color}-${index}`}
                                                size={18}
                                                color={color}
                                            />
                                        ))}
                                </Group>
                            </Tooltip>
                            {hasDarkColors && (
                                <>
                                    <Text c="dimmed" mx={4}>
                                        /
                                    </Text>
                                    <Tooltip label="Dark mode" position="top">
                                        <Group gap="two">
                                            <MantineIcon
                                                icon={IconMoon}
                                                size="sm"
                                                color="foreground"
                                            />
                                            {palette
                                                .darkColors!.slice(0, 5)
                                                .map((color, index) => (
                                                    <ColorSwatch
                                                        key={`dark-${color}-${index}`}
                                                        size={18}
                                                        color={color}
                                                    />
                                                ))}
                                        </Group>
                                    </Tooltip>
                                </>
                            )}
                        </Group>

                        {readOnly && (
                            <Tooltip
                                label="This palette is read only. It has been configured as the override color palette for your organization. While this is set, you cannot update/edit, or delete this palette."
                                position="bottom-end"
                                maw={200}
                            >
                                <Badge>
                                    <Group gap={2}>
                                        Override
                                        <MantineIcon
                                            size="sm"
                                            icon={IconInfoCircle}
                                        />
                                    </Group>
                                </Badge>
                            </Tooltip>
                        )}
                    </Stack>

                    <Group gap="xs">
                        {onSetActive && !isActive && (
                            <Button
                                onClick={() =>
                                    onSetActive(palette.colorPaletteUuid)
                                }
                                variant="default"
                                size="xs"
                            >
                                Use palette
                            </Button>
                        )}

                        {isActive && <Badge color="green">Default</Badge>}

                        <Menu position="bottom-end" disabled={readOnly}>
                            <Menu.Target>
                                <Tooltip label="Palette actions">
                                    <ActionIcon
                                        size="sm"
                                        aria-label={`Actions for ${palette.name}`}
                                    >
                                        <MantineIcon icon={IconDotsVertical} />
                                    </ActionIcon>
                                </Tooltip>
                            </Menu.Target>

                            <Menu.Dropdown>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconCopy} />
                                    }
                                    onClick={handleCopyUuid}
                                >
                                    Copy UUID
                                </Menu.Item>
                                {canManage && (
                                    <>
                                        <Menu.Item
                                            disabled={readOnly}
                                            leftSection={
                                                <MantineIcon icon={IconEdit} />
                                            }
                                            onClick={() =>
                                                setIsEditModalOpen(true)
                                            }
                                        >
                                            Edit palette
                                        </Menu.Item>
                                        <Menu.Item
                                            leftSection={
                                                <MantineIcon icon={IconTrash} />
                                            }
                                            onClick={() =>
                                                setIsDeleteModalOpen(true)
                                            }
                                            disabled={isActive || readOnly}
                                            color="red"
                                        >
                                            Delete palette
                                        </Menu.Item>
                                    </>
                                )}
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Group>
            </Paper>

            <EditPaletteModal
                key={`edit-palette-modal-${isEditModalOpen}`}
                palette={palette}
                opened={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
            />

            <DeletePaletteModal
                palette={palette}
                opened={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeletePalette}
            />
        </>
    );
};
