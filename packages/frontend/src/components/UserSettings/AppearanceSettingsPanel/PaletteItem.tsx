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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('userSettings');
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
        showToastSuccess({
            title: t('appearanceSettingsPanel.paletteItem.uuidCopied'),
        });
    }, [clipboard, showToastSuccess, palette.colorPaletteUuid, t]);

    const hasDarkColors =
        palette.darkColors !== null && palette.darkColors !== undefined;

    return (
        <>
            <Paper
                p="sm"
                radius="sm"
                pos="relative"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <Flex justify="space-between" align="center">
                    <Group gap="sm">
                        <Group gap="two">
                            <Tooltip
                                label={t(
                                    'appearanceSettingsPanel.paletteItem.lightMode',
                                )}
                                position="top"
                            >
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
                                    <Tooltip
                                        label={t(
                                            'appearanceSettingsPanel.paletteItem.darkMode',
                                        )}
                                        position="top"
                                    >
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
                                label={t(
                                    'appearanceSettingsPanel.paletteItem.readOnlyTooltip',
                                )}
                                position="bottom-end"
                                maw={200}
                            >
                                <Badge>
                                    <Group gap={2}>
                                        {t(
                                            'appearanceSettingsPanel.paletteItem.override',
                                        )}
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
                                {t(
                                    'appearanceSettingsPanel.paletteItem.useThisTheme',
                                )}
                            </Button>
                        )}

                        {isActive && (
                            <Badge color="green">
                                {t(
                                    'appearanceSettingsPanel.paletteItem.active',
                                )}
                            </Badge>
                        )}

                        <Menu position="bottom-end" disabled={readOnly}>
                            <Menu.Target>
                                <ActionIcon
                                    size="xs"
                                    aria-label={t(
                                        'appearanceSettingsPanel.paletteItem.actions',
                                    )}
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
                                    {t(
                                        'appearanceSettingsPanel.paletteItem.copyUuid',
                                    )}
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
                                            {t(
                                                'appearanceSettingsPanel.paletteItem.editPalette',
                                            )}
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
                                            {t(
                                                'appearanceSettingsPanel.paletteItem.deletePalette',
                                            )}
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
