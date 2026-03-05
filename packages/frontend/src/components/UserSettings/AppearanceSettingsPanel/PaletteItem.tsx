import { type OrganizationColorPalette } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    ColorSwatch,
    Flex,
    Group,
    Menu,
    Paper,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconDotsVertical,
    IconEdit,
    IconInfoCircle,
    IconMoon,
    IconSun,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useDeleteColorPalette } from '../../../hooks/appearance/useOrganizationAppearance';
import MantineIcon from '../../common/MantineIcon';
import { DeletePaletteModal } from './DeletePaletteModal';
import { EditPaletteModal } from './EditPaletteModal';

type PaletteItemProps = {
    palette: Omit<OrganizationColorPalette, 'name'> & { name: string };
    isActive: boolean;
    onSetActive?: ((uuid: string) => void) | undefined;
    readOnly?: boolean;
};

export const PaletteItem: FC<PaletteItemProps> = ({
    palette,
    isActive,
    onSetActive,
    readOnly,
}) => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const deleteColorPalette = useDeleteColorPalette();

    const handleDeletePalette = () => {
        deleteColorPalette.mutate(palette.colorPaletteUuid);
        setIsDeleteModalOpen(false);
    };

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
                    <Group spacing="sm">
                        <Group spacing="two">
                            <Tooltip label="Light mode" position="top">
                                <Group spacing="two">
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
                                        <Group spacing="two">
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
                                    <Group spacing={2}>
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

                    <Group spacing="xs">
                        {onSetActive && (
                            <Button
                                onClick={() =>
                                    onSetActive(palette.colorPaletteUuid)
                                }
                                h={32}
                                sx={() => ({
                                    visibility:
                                        isHovered && !isActive
                                            ? 'visible'
                                            : 'hidden',
                                })}
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
                                <ActionIcon size="xs" disabled={readOnly}>
                                    <MantineIcon icon={IconDotsVertical} />
                                </ActionIcon>
                            </Menu.Target>

                            <Menu.Dropdown>
                                <Menu.Item
                                    icon={<MantineIcon icon={IconEdit} />}
                                    onClick={() => setIsEditModalOpen(true)}
                                >
                                    Edit palette
                                </Menu.Item>
                                <Menu.Item
                                    icon={<MantineIcon icon={IconTrash} />}
                                    onClick={() => setIsDeleteModalOpen(true)}
                                    disabled={isActive}
                                    color="red"
                                >
                                    Delete palette
                                </Menu.Item>
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
