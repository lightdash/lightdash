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
} from '@mantine-8/core';
import {
    IconDotsVertical,
    IconEdit,
    IconInfoCircle,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useDeleteColorPalette } from '../../../hooks/appearance/useOrganizationAppearance';
import MantineIcon from '../../common/MantineIcon';
import { DeletePaletteModal } from './DeletePaletteModal';
import { EditPaletteModal } from './EditPaletteModal';
import styles from './PaletteItem.module.css';

type PaletteItemProps = {
    palette: Omit<OrganizationColorPalette, 'name'> & { name: string };
    isActive: boolean;
    onSetActive?: ((uuid: string) => void) | undefined;
    readOnly?: boolean;
    theme?: 'light' | 'dark';
};

export const PaletteItem: FC<PaletteItemProps> = ({
    palette,
    isActive,
    onSetActive,
    readOnly,
    theme = 'light',
}) => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const deleteColorPalette = useDeleteColorPalette();

    const handleDeletePalette = () => {
        deleteColorPalette.mutate(palette.colorPaletteUuid);
        setIsDeleteModalOpen(false);
    };

    const displayColors =
        theme === 'dark' && palette.darkColors
            ? palette.darkColors
            : palette.colors;

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
                    <Group gap="xs">
                        <Group gap="two">
                            {displayColors.slice(0, 5).map((color, index) => (
                                <ColorSwatch
                                    key={color + index}
                                    size={18}
                                    color={color}
                                />
                            ))}
                        </Group>
                        <Text fw={500}>{palette.name}</Text>
                        {readOnly && (
                            <Tooltip
                                label="This palette is read only. It has been configured as the override color palette for your organization. While this is set, you cannot update/edit, or delete this palette."
                                position="bottom-end"
                                multiline
                                maw={200}
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
                                className={
                                    isHovered && !isActive
                                        ? undefined
                                        : styles.hidden
                                }
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
                                    leftSection={
                                        <MantineIcon icon={IconEdit} />
                                    }
                                    onClick={() => setIsEditModalOpen(true)}
                                >
                                    Edit palette
                                </Menu.Item>
                                <Menu.Item
                                    leftSection={
                                        <MantineIcon icon={IconTrash} />
                                    }
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
