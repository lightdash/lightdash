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
} from '@mantine/core';
import { IconDotsVertical, IconEdit, IconTrash } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useDeleteColorPalette } from '../../../hooks/appearance/useOrganizationAppearance';
import MantineIcon from '../../common/MantineIcon';
import { DeletePaletteModal } from './DeletePaletteModal';
import { EditPaletteModal } from './EditPaletteModal';

type PaletteItemProps = {
    palette: OrganizationColorPalette;
    isActive: boolean;
    onSetActive: (uuid: string) => void;
};

export const PaletteItem: FC<PaletteItemProps> = ({
    palette,
    isActive,
    onSetActive,
}) => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const deleteColorPalette = useDeleteColorPalette();

    const handleDeletePalette = () => {
        deleteColorPalette.mutate(palette.colorPaletteUuid);
        setIsDeleteModalOpen(false);
    };

    return (
        <>
            <Paper
                p="sm"
                withBorder
                radius="sm"
                sx={(theme) => ({
                    backgroundColor: theme.white,
                    borderColor: theme.colors.gray[2],
                    position: 'relative',
                })}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <Flex justify="space-between" align="center">
                    <Group spacing="xs">
                        <Group spacing="two">
                            {palette.colors.slice(0, 5).map((color, index) => (
                                <ColorSwatch
                                    key={color + index}
                                    size={18}
                                    color={color}
                                />
                            ))}
                        </Group>
                        <Text fw={500}>{palette.name}</Text>
                    </Group>

                    <Group spacing="xs">
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

                        {isActive && (
                            <Badge color="green" variant="light">
                                Active
                            </Badge>
                        )}

                        <Menu shadow="subtle" position="bottom-end">
                            <Menu.Target>
                                <ActionIcon size="xs">
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
