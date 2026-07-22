import { type OrganizationColorPalette } from '@lightdash/common';
import {
    Flex,
    Group,
    Paper,
    Text,
    Button,
    ActionIcon,
    Badge,
    ColorSwatch,
    Menu,
} from '@mantine-8/core';
import { Tooltip } from '@mantine/core';
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
    const [isHovered, setIsHovered] = useState(false);
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
            <Paper
                p="sm"
                withBorder
                radius="sm"
                pos="relative"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <Flex justify="space-between" align="center">
                    <Group gap="sm">
                        <Group gap="two">
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
                                    <Text c="ldGray.3" mx={4}>
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
                        <Text c="ldGray.3" mx={4}>
                            |
                        </Text>

                        <Text fw={500}>{palette.name}</Text>

                        {readOnly && (
                            <Tooltip
                                label="This palette is read only. It has been configured as the override color palette for your organization. While this is set, you cannot update/edit, or delete this palette."
                                position="bottom-end"
                                multiline
                                maw={200}
                                variant="xs"
                            >
                                <Badge color="gray" variant="light">
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
                    </Group>

                    <Group gap="xs">
                        {onSetActive && (
                            <Button
                                onClick={() =>
                                    onSetActive(palette.colorPaletteUuid)
                                }
                                h={32}
                                style={{
                                    visibility:
                                        isHovered && !isActive
                                            ? 'visible'
                                            : 'hidden',
                                }}
                            >
                                Use This Theme
                            </Button>
                        )}

                        {isActive && (
                            <Badge color="green" variant="light">
                                Active
                            </Badge>
                        )}

                        <Menu
                            shadow="subtle"
                            position="bottom-end"
                            disabled={readOnly}
                        >
                            <Menu.Target>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    size="xs"
                                    aria-label="Palette actions"
                                >
                                    <MantineIcon icon={IconDotsVertical} />
                                </ActionIcon>
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
                </Flex>
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
