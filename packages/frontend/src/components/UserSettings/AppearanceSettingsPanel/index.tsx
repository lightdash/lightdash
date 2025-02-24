import {
    ECHARTS_DEFAULT_COLORS,
    type OrganizationColorPalette,
} from '@lightdash/common';
import {
    Accordion,
    ActionIcon,
    Badge,
    Button,
    Card,
    ColorInput,
    ColorSwatch,
    Group,
    Modal,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconBolt,
    IconBrush,
    IconColorFilter,
    IconCubeUnfolded,
    IconInfoCircle,
    IconLeaf,
    IconPlus,
    IconRipple,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
import {
    useColorPalettes,
    useCreateColorPalette,
    useSetDefaultColorPalette,
    useUpdateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import { isHexCodeColor } from '../../../utils/colorUtils';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';

interface ColorPalette {
    name: string;
    colors: string[];
    icon: typeof IconBolt;
}

const PRESET_COLOR_PALETTES: ColorPalette[] = [
    {
        name: 'Default Colors',
        icon: IconColorFilter,
        colors: [
            // Use the initial 9 colors directly from ECHARTS to keep them in sync:
            ...ECHARTS_DEFAULT_COLORS,
            '#33ff7d',
            '#33ffb1',
            '#33ffe6',
            '#33e6ff',
            '#33b1ff',
            '#337dff',
            '#3349ff',
            '#5e33ff',
            '#9233ff',
            '#c633ff',
            '#ff33e1',
        ],
    },
    {
        name: 'Modern',
        icon: IconCubeUnfolded,
        colors: [
            '#7162FF', // Lightdash Purple
            '#1A1B1E', // Charcoal
            '#2D2E30', // Dark Gray
            '#4A4B4D', // Medium Gray
            '#6B6C6E', // Light Gray
            '#E8DDFB', // Lavender
            '#D4F7E9', // Mint
            '#F0A3FF', // Pink
            '#00FFEA', // Cyan
            '#FFEA00', // Yellow
            '#00FF7A', // Neon Green
            '#FF0080', // Magenta
            '#FF6A00', // Orange
            '#6A00FF', // Deep Purple
            '#00FF00', // Lime
            '#FF0000', // Red
            '#FF00FF', // Fuchsia
            '#00FFFF', // Aqua
            '#7A00FF', // Violet
            '#FFAA00', // Amber
        ],
    },
    {
        name: 'Retro',
        icon: IconLeaf,
        colors: [
            '#FF6B35', // Vibrant Orange
            '#ECB88A', // Peach
            '#D4A373', // Terracotta
            '#BC8A5F', // Clay
            '#A47148', // Brown
            '#8A5A39', // Dark Brown
            '#6F4E37', // Mocha
            '#544334', // Umber
            '#393731', // Slate
            '#2E2E2E', // Charcoal
            '#F4D06F', // Mustard
            '#FFD700', // Gold
            '#C0BABC', // Silver
            '#A9A9A9', // Medium Gray
            '#808080', // Gray
            '#696969', // Dim Gray
            '#556B2F', // Olive
            '#6B8E23', // Olive Drab
            '#8FBC8B', // Dark Sea Green
            '#BDB76B', // Dark Khaki
        ],
    },
    {
        name: 'Business',
        icon: IconRipple,
        colors: [
            '#1A237E',
            '#283593',
            '#303F9F',
            '#3949AB',
            '#3F51B5',
            '#5C6BC0',
            '#7986CB',
            '#9FA8DA',
            '#C5CAE9',
            '#E8EAF6',
            '#4CAF50',
            '#66BB6A',
            '#81C784',
            '#A5D6A7',
            '#C8E6C9',
            '#FFA726',
            '#FFB74D',
            '#FFCC80',
            '#FFE0B2',
            '#FFF3E0',
        ],
    },
    {
        name: 'Lightdash of Color',
        icon: IconBolt,
        colors: [
            '#7162FF',
            '#1A1B1E',
            '#E8DDFB',
            '#D4F7E9',
            '#F0A3FF',
            '#00FFEA',
            '#FFEA00',
            '#00FF7A',
            '#FF0080',
            '#FF6A00',
            '#6A00FF',
            '#00FF00',
            '#FF0000',
            '#FF00FF',
            '#00FFFF',
            '#7A00FF',
            '#FF7A00',
            '#00FFAA',
            '#FF00AA',
            '#FFAA00',
        ],
    },
    {
        name: 'Data Matrix',
        icon: IconCubeUnfolded,
        colors: [
            '#FF00FF',
            '#00FFFF',
            '#FFFF00',
            '#FF0080',
            '#00FF00',
            '#00FF80',
            '#8000FF',
            '#FF8000',
            '#FF0088',
            '#00FF88',
            '#0088FF',
            '#88FF00',
            '#FF8800',
            '#FF8800',
            '#FF0088',
            '#8800FF',
            '#0088FF',
            '#8800FF',
            '#00FF88',
            '#FF8800',
        ],
    },
];

const getColorPaletteColorStops = (palette: ColorPalette, stops: number) => {
    const { colors } = palette;
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
    return colors.filter((c, i) => i % deltaAmount === 0).slice(0, stops);
};

const AppearanceColorSettings: FC = () => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const ability = useAbilityContext();
    const { data: palettes = [] } = useColorPalettes();
    const createColorPalette = useCreateColorPalette();
    const setDefaultPalette = useSetDefaultColorPalette();
    const updateColorPalette = useUpdateColorPalette();

    const [selectedPalette, setSelectedPalette] =
        useState<OrganizationColorPalette>();
    const [editingPaletteUuid, setEditingPaletteUuid] = useState<string | null>(
        null,
    );
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [newPaletteName, setNewPaletteName] = useState('');
    const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState<ColorPalette>();

    const form = useForm<{ colors: string[]; uuid: string }>({
        initialValues: { colors: [], uuid: '' },
        validate: {
            colors: (value) =>
                value.every((c) => isHexCodeColor(c)) ? null : 'Invalid colors',
        },
    });

    const { setValues } = form;

    const presetForm = useForm({
        initialValues: {
            name: '',
            colors: [],
        },
        validate: {
            name: (value) =>
                value.trim().length >= 3
                    ? null
                    : 'Name must be at least 3 characters',
            colors: (value) =>
                value.length > 0 ? null : 'Please select a base preset',
        },
    });

    // When selecting a palette
    const handleSelectPalette = useCallback(
        (palette: OrganizationColorPalette) => {
            setSelectedPalette(palette);
            setEditingPaletteUuid(null);
            setValues({
                colors: palette.colors,
                uuid: palette.colorPaletteUuid,
            });
        },
        [setValues],
    );

    // Apply existing palette
    const handleUseTheme = (palette: OrganizationColorPalette) => {
        setDefaultPalette.mutate(palette.colorPaletteUuid, {
            onSuccess: () => {
                showToastSuccess({ title: `${palette.name} theme activated` });
                // Refresh palettes list
            },
        });
    };

    // Save new palette
    const handleSaveNewPalette = (apply: boolean) => {
        if (!selectedPalette || !newPaletteName) return;

        createColorPalette.mutate(
            {
                name: newPaletteName,
                colors: form.values.colors,
            },
            {
                onSuccess: (newPalette) => {
                    setShowSaveModal(false);
                    setNewPaletteName('');
                    handleSelectPalette(newPalette);
                    if (apply) {
                        setDefaultPalette.mutate(newPalette.colorPaletteUuid);
                    }
                },
            },
        );
    };

    // Create new palette from preset
    const handleCreateFromPreset = () => {
        createColorPalette.mutate(
            {
                name: presetForm.values.name,
                colors: presetForm.values.colors,
            },
            {
                onSuccess: (newPalette) => {
                    setIsPresetModalOpen(false);
                    presetForm.reset();
                    setSelectedPreset(undefined);
                    handleSelectPalette(newPalette);
                    showToastSuccess({
                        title: `Palette "${newPalette.name}" created successfully`,
                    });
                },
                onError: (error) => {
                    showToastApiError({
                        title: 'Failed to create palette',
                        apiError: error.error,
                    });
                },
            },
        );
    };

    // Update palette handler
    const handleUpdatePalette = () => {
        updateColorPalette.mutate({
            uuid: form.values.uuid,
            colors: form.values.colors,
        });
    };

    useEffect(() => {
        if (updateColorPalette.isSuccess) {
            setEditingPaletteUuid(null);
            showToastSuccess({ title: 'Palette updated successfully' });
            handleSelectPalette(updateColorPalette.data);
        }
    }, [
        updateColorPalette.isSuccess,
        updateColorPalette.data,
        showToastSuccess,
        handleSelectPalette,
    ]);

    // Update edit handler
    const handleStartEditing = (palette: OrganizationColorPalette) => {
        setSelectedPalette(palette);
        setEditingPaletteUuid(palette.colorPaletteUuid);
        form.setValues({
            colors: palette.colors,
            uuid: palette.colorPaletteUuid,
        });
    };

    const isEditingPalette = (palette: OrganizationColorPalette) =>
        editingPaletteUuid === palette.colorPaletteUuid;

    const setActivePalette = (palette: OrganizationColorPalette) => {
        form.setValues({
            colors: palette.colors,
            uuid: palette.colorPaletteUuid,
        });
    };

    return (
        <Stack spacing="md">
            <Accordion variant="contained">
                {palettes.map((palette) => (
                    <Accordion.Item
                        key={palette.colorPaletteUuid}
                        value={palette.colorPaletteUuid}
                    >
                        <Accordion.Control
                            onClick={() => setActivePalette(palette)}
                        >
                            <Group spacing="xs">
                                <Text fw={500}>{palette.name}</Text>

                                <Group spacing="xxs">
                                    {getColorPaletteColorStops(
                                        {
                                            name: palette.name,
                                            colors: palette.colors,
                                            icon: IconBrush,
                                        },
                                        4,
                                    ).map((color, index) => (
                                        <ColorSwatch
                                            key={color + index}
                                            size={16}
                                            color={color}
                                        />
                                    ))}
                                </Group>
                                {palette.isDefault && (
                                    <Badge
                                        color="green"
                                        variant="light"
                                        radius="sm"
                                        sx={(theme) => ({
                                            border: `1px solid ${theme.colors.green[6]}`,
                                        })}
                                    >
                                        Active
                                    </Badge>
                                )}
                                {isEditingPalette(palette) && (
                                    <Badge
                                        color="yellow"
                                        variant="light"
                                        radius="sm"
                                        sx={(theme) => ({
                                            border: `1px solid ${theme.colors.yellow[6]}`,
                                        })}
                                    >
                                        Editing...
                                    </Badge>
                                )}
                            </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                            <Stack spacing="md">
                                <Group spacing="xs">
                                    {form.values.colors.map((color, index) => (
                                        <ColorInput
                                            key={index}
                                            value={color}
                                            onChange={(newColor) => {
                                                const newColors = [
                                                    ...form.values.colors,
                                                ];
                                                newColors[index] = newColor;
                                                form.setFieldValue(
                                                    'colors',
                                                    newColors,
                                                );
                                            }}
                                            readOnly={
                                                !isEditingPalette(palette)
                                            }
                                            radius="md"
                                            size="xs"
                                            swatches={palette.colors}
                                        />
                                    ))}
                                </Group>

                                <Group position="right">
                                    <Button
                                        onClick={() => {
                                            if (isEditingPalette(palette)) {
                                                handleUpdatePalette();
                                            } else {
                                                handleStartEditing(palette);
                                            }
                                        }}
                                        loading={updateColorPalette.isLoading}
                                        size="xs"
                                        variant="default"
                                    >
                                        {isEditingPalette(palette)
                                            ? 'Save changes'
                                            : 'Edit colors'}
                                    </Button>

                                    <Button
                                        onClick={async () => {
                                            if (isEditingPalette(palette)) {
                                                await updateColorPalette.mutateAsync(
                                                    {
                                                        uuid: form.values.uuid,
                                                        colors: form.values
                                                            .colors,
                                                    },
                                                );
                                            }
                                            handleUseTheme(palette);
                                        }}
                                        loading={setDefaultPalette.isLoading}
                                        size="xs"
                                        disabled={palette.isDefault}
                                    >
                                        {palette.isDefault
                                            ? 'Active'
                                            : `${
                                                  isEditingPalette(palette)
                                                      ? 'Save & use this theme'
                                                      : 'Use this theme'
                                              }`}
                                    </Button>
                                </Group>
                            </Stack>
                        </Accordion.Panel>
                    </Accordion.Item>
                ))}
            </Accordion>

            <Modal
                opened={showSaveModal}
                onClose={() => setShowSaveModal(false)}
                title={`${
                    selectedPalette?.colorPaletteUuid === 'new'
                        ? 'Save'
                        : 'Update'
                } Theme`}
            >
                <TextInput
                    label="Theme name"
                    value={newPaletteName}
                    onChange={(e) => setNewPaletteName(e.currentTarget.value)}
                    required
                />
                <Group mt="md" position="right">
                    {selectedPalette?.colorPaletteUuid === 'new' ? (
                        <>
                            <Button
                                variant="default"
                                onClick={() => handleSaveNewPalette(false)}
                            >
                                Save theme
                            </Button>
                            <Button onClick={() => handleSaveNewPalette(true)}>
                                Save & apply
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="default"
                                onClick={handleUpdatePalette}
                            >
                                Save changes
                            </Button>
                            <Button
                                onClick={() => {
                                    if (!selectedPalette) return;
                                    handleUpdatePalette();
                                    handleUseTheme(selectedPalette);
                                }}
                            >
                                Save & apply
                            </Button>
                        </>
                    )}
                </Group>
            </Modal>

            <Button
                leftIcon={<MantineIcon icon={IconPlus} />}
                onClick={() => setIsPresetModalOpen(true)}
                variant="default"
                size="xs"
                sx={{ alignSelf: 'flex-end' }}
            >
                Add new palette
            </Button>

            <Modal
                opened={isPresetModalOpen}
                onClose={() => {
                    setIsPresetModalOpen(false);
                    presetForm.reset();
                    setSelectedPreset(undefined);
                }}
                title="Create new palette"
                size="xl"
            >
                <form onSubmit={presetForm.onSubmit(handleCreateFromPreset)}>
                    <TextInput
                        label="Palette name"
                        placeholder="Enter a unique name"
                        required
                        radius="md"
                        {...presetForm.getInputProps('name')}
                        error={presetForm.errors.name}
                    />

                    <Text mt="md" fw={500} color="dimmed">
                        Choose a base preset:
                    </Text>
                    {presetForm.errors.colors && (
                        <Text color="red" size="sm" mt="xs">
                            {presetForm.errors.colors}
                        </Text>
                    )}

                    <SimpleGrid cols={3} mt="sm">
                        {PRESET_COLOR_PALETTES.map((preset) => (
                            <Card
                                key={preset.name}
                                withBorder
                                sx={(theme) => ({
                                    cursor: 'pointer',

                                    '&:hover': {
                                        borderColor: theme.colors.blue[4],
                                    },
                                    '&[data-with-border]': {
                                        border: `2px solid ${
                                            selectedPreset?.name === preset.name
                                                ? theme.colors.blue[6]
                                                : theme.colors.gray[3]
                                        }`,
                                    },
                                    transition: 'border-color 150ms ease',
                                })}
                                onClick={() => {
                                    setSelectedPreset(preset);
                                    presetForm.setFieldValue(
                                        'colors',
                                        preset.colors as string[],
                                    );
                                }}
                                radius="md"
                                shadow="subtle"
                            >
                                <Stack spacing="xs">
                                    <Group spacing={4}>
                                        {preset.colors
                                            .slice(0, 5)
                                            .map((color) => (
                                                <ColorSwatch
                                                    key={color}
                                                    color={color}
                                                    size={16}
                                                />
                                            ))}
                                    </Group>
                                    <Group spacing="xs">
                                        <Text size="sm" fw={500}>
                                            {preset.name}
                                        </Text>
                                    </Group>
                                </Stack>
                            </Card>
                        ))}
                    </SimpleGrid>

                    <Group position="right" mt="md">
                        <Button
                            type="submit"
                            disabled={!presetForm.isValid()}
                            loading={createColorPalette.isLoading}
                        >
                            Create palette
                        </Button>
                    </Group>
                </form>
            </Modal>
        </Stack>
    );
};

const AppearanceSettingsPanel: FC = () => {
    return (
        <Stack spacing="sm">
            <Group spacing="xxs">
                <Title order={5}>Appearance settings</Title>
                <Tooltip
                    label="Click here to learn more about customizing the appearance of your project"
                    position="bottom"
                >
                    <ActionIcon
                        component="a"
                        href="https://docs.lightdash.com/guides/customizing-the-appearance-of-your-project"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <SettingsCard mb="lg">
                <AppearanceColorSettings />
            </SettingsCard>
        </Stack>
    );
};

export default AppearanceSettingsPanel;
