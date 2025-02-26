import { type OrganizationColorPalette } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Center,
    ColorSwatch,
    Flex,
    Group,
    Menu,
    Modal,
    Paper,
    ScrollArea,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import {
    IconChevronDown,
    IconDotsVertical,
    IconEdit,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useDeleteColorPalette } from '../../../hooks/appearance/useOrganizationAppearance';
import MantineIcon from '../../common/MantineIcon';
import { EditPaletteModal } from './EditPaletteModal';

interface PaletteItemProps {
    palette: OrganizationColorPalette;
    isDefault: boolean;
    onSetDefault: (uuid: string) => void;
}

interface DeletePaletteModalProps {
    palette: OrganizationColorPalette;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

const DeletePaletteModal: FC<DeletePaletteModalProps> = ({
    palette,
    isOpen,
    onClose,
    onConfirm,
}) => {
    const [showAllColors, setShowAllColors] = useState(false);
    const colorsToShow = showAllColors
        ? palette.colors
        : palette.colors.slice(0, 10);

    return (
        <Modal
            radius="sm"
            opened={isOpen}
            onClose={onClose}
            title={
                <Group>
                    <Paper p="xs" withBorder radius="sm">
                        <MantineIcon icon={IconTrash} size="sm" color="red" />
                    </Paper>
                    <Text color="dark.7" fw={500} fz="md">
                        Delete "{palette.name}" Palette
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: {
                    borderBottom: `1px solid ${theme.colors.gray[2]}`,
                },
                body: {
                    padding: 0,
                },
            })}
            size="md"
        >
            <Stack p="md" spacing="xs">
                <Text size="sm" color="gray.6">
                    Are you sure you want to delete this color palette? This
                    action cannot be undone.
                </Text>

                <Stack spacing="xs">
                    <ScrollArea
                        h={showAllColors ? 200 : 'auto'}
                        offsetScrollbars
                    >
                        <Center>
                            <SimpleGrid cols={5} spacing="xs">
                                {colorsToShow.map((color, index) => (
                                    <ColorSwatch
                                        key={color + index}
                                        size={24}
                                        color={color}
                                    />
                                ))}
                            </SimpleGrid>
                        </Center>
                    </ScrollArea>

                    <Button
                        variant="light"
                        color="blue"
                        size="xs"
                        radius="md"
                        onClick={() => setShowAllColors(!showAllColors)}
                        rightIcon={
                            <MantineIcon icon={IconChevronDown} size="xs" />
                        }
                        fullWidth
                        mt="xs"
                    >
                        {showAllColors
                            ? 'Show fewer colors'
                            : 'Show all colors'}
                    </Button>
                </Stack>
            </Stack>

            <Group
                position="right"
                p="md"
                sx={(theme) => ({
                    borderTop: `1px solid ${theme.colors.gray[2]}`,
                })}
            >
                <Button variant="default" size="xs" onClick={onClose}>
                    Cancel
                </Button>
                <Button color="red" onClick={onConfirm} size="xs">
                    Delete Palette
                </Button>
            </Group>
        </Modal>
    );
};

export const PaletteItem: FC<PaletteItemProps> = ({
    palette,
    isDefault,
    onSetDefault,
}) => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const deleteColorPalette = useDeleteColorPalette();

    const handleDeletePalette = () => {
        deleteColorPalette.mutate(palette.colorPaletteUuid);
        setIsDeleteModalOpen(false);
    };

    const getColorPaletteColorStops = useCallback(
        (colors: string[], stops: number) => {
            const deltaAmount = Math.floor(colors.length / stops);
            /**
             * If for some reason we don't get enough color stops, or the number of stops
             * matches the available colors, we short-circuit and just return an equivalent
             * subset of colors:
             */
            if (deltaAmount <= 0 || stops === colors.length) {
                return colors.slice(0, colors.length);
            }

            /**
             * This is fairly inefficient, but we're doing this over a very small list,
             * in a very specific place only.
             */
            return colors
                .filter((c, i) => i % deltaAmount === 0)
                .slice(0, stops);
        },
        [],
    );

    return (
        <>
            <Paper
                p="sm"
                withBorder
                radius="md"
                sx={(theme) => ({
                    backgroundColor: theme.white,
                    borderColor: theme.colors.gray[2],
                })}
            >
                <Flex justify="space-between" align="center">
                    <Group spacing="xs">
                        <Text fw={500}>{palette.name}</Text>
                        <Group spacing="xxs">
                            {getColorPaletteColorStops(palette.colors, 4).map(
                                (color, index) => (
                                    <ColorSwatch
                                        key={color + index}
                                        size={16}
                                        color={color}
                                    />
                                ),
                            )}
                        </Group>
                        {isDefault && (
                            <Badge color="green" variant="light" radius="md">
                                Active
                            </Badge>
                        )}
                    </Group>

                    <Group spacing="xs">
                        <Button
                            display={isDefault ? 'none' : 'block'}
                            size="xs"
                            radius="md"
                            onClick={() =>
                                onSetDefault(palette.colorPaletteUuid)
                            }
                        >
                            Use This Theme
                        </Button>

                        <Menu shadow="subtle" position="bottom-end">
                            <Menu.Target>
                                <ActionIcon radius="md" size="xs">
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
                                    disabled={isDefault}
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
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
            />

            <DeletePaletteModal
                palette={palette}
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeletePalette}
            />
        </>
    );
};
