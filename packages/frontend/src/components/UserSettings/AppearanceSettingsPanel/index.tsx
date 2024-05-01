import { subject } from '@casl/ability';
import { ECHARTS_DEFAULT_COLORS } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Card,
    ColorInput,
    ColorSwatch,
    Flex,
    Group,
    Loader,
    Popover,
    SimpleGrid,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconBolt,
    IconChevronDown,
    IconColorFilter,
    IconCubeUnfolded,
    IconInfoCircle,
    IconLeaf,
    IconRestore,
    IconRipple,
    IconSunglasses,
} from '@tabler/icons-react';
import { isEqual } from 'lodash';
import { useCallback, useEffect, useState, type FC } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';
import { useApp } from '../../../providers/AppProvider';
import { isHexCodeColor } from '../../../utils/colorUtils';
import { Can, useAbilityContext } from '../../common/Authorization';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';

interface ColorPalette {
    name: string;
    colors: string[];
    icon: typeof IconBolt;
}

const defaultColorPalettes: ColorPalette[] = [
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
        name: 'Sunrise Serenity',
        icon: IconSunglasses,
        colors: [
            '#FF6464',
            '#FF6F6F',
            '#FF7B7B',
            '#FF8686',
            '#FF9292',
            '#FF9D9D',
            '#FFA9A9',
            '#FFB4B4',
            '#FFBFBF',
            '#FFCACA',
            '#FFD6D6',
            '#FFE1E1',
            '#FFEBEB',
            '#FFF6F6',
            '#FFFFFF',
            '#F6FFF9',
            '#EDFFF3',
            '#E4FFED',
            '#DBFFE7',
            '#D2FFE1',
        ],
    },
    {
        name: 'Autumn Sunset',
        icon: IconLeaf,
        colors: [
            '#C2590F',
            '#CB650F',
            '#D5710F',
            '#DF7D0F',
            '#E9890F',
            '#F3950F',
            '#FD9F0F',
            '#FFAB1F',
            '#FFB72F',
            '#FFC23F',
            '#FFCE4F',
            '#FFDA5F',
            '#FFE66F',
            '#FFF27F',
            '#FFF88F',
            '#FFFE9F',
            '#FFFFAF',
            '#FFFFBF',
            '#FFFFCF',
            '#FFFFDF',
        ],
    },
    {
        name: 'Oceanic Blues',
        icon: IconRipple,
        colors: [
            '#0D4F8B',
            '#195A96',
            '#2565A1',
            '#3170AC',
            '#3D7BB7',
            '#4986C2',
            '#5591CD',
            '#619CD8',
            '#6DA7E3',
            '#79B2EE',
            '#85BEF9',
            '#91C9FF',
            '#9DD4FF',
            '#A9DFFF',
            '#B5EAFF',
            '#C1F5FF',
            '#CDFDFF',
            '#DAFFFF',
            '#E6FFFF',
            '#F2FFFF',
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

const getColorFormFields = (colors: string[]): ColorAssignments =>
    colors.reduce(
        (acc, color, index) => ({ ...acc, [`color${index + 1}`]: color }),
        {},
    );

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

const findMatchingDefaultColorPalette = (
    colors: string[],
): ColorPalette | undefined =>
    defaultColorPalettes.find((palette) => isEqual(palette.colors, colors));

type ColorAssignments = Record<string, string>;

const ColorPalettePreview: FC<{
    palette: ColorPalette;
    isActive: boolean;
    onSelect: () => void;
}> = ({ palette, isActive, onSelect }) => {
    const stops = getColorPaletteColorStops(palette, 4);
    const { name, icon } = palette;

    return (
        <Flex align="center" justify="space-between" gap="xl">
            <Group spacing="xs">
                <Group spacing="xxs">
                    {stops.map((color) => (
                        <ColorSwatch key={color} color={color} />
                    ))}
                </Group>
                <MantineIcon icon={icon} />
                <Text size="xs">{name}</Text>
            </Group>

            <Button size="xs" ml="xs" onClick={onSelect} disabled={isActive}>
                Use theme
            </Button>
        </Flex>
    );
};

const AppearanceColorSettings: FC = () => {
    const ability = useAbilityContext();
    const { isInitialLoading: isOrgLoading, data } = useOrganization();
    const updateMutation = useOrganizationUpdateMutation();
    const colorFormFields = getColorFormFields(defaultColorPalettes[0].colors);

    /**
     * We keep track of color palettes manually selected by the user, so that if
     * they're customizing it further we can quickly reference the starting point
     * again.
     */
    const [startingColorPalette, setStartingColorPalette] =
        useState<ColorPalette>();

    const form = useForm({
        initialValues: colorFormFields,
        validate: Object.keys(colorFormFields).reduce(
            (acc, key) => ({
                [key]: (value: string) =>
                    !isHexCodeColor(value)
                        ? 'Invalid color, ensure it is in hex format (e.g. #ff000 or #fff)'
                        : null,
                ...acc,
            }),
            {},
        ),
    });

    /**
     * At any point, we try to match the current color palette based on the list of colors.
     * This allows us to reference an existing theme just based on the available state.
     */
    const activeColorPalette =
        startingColorPalette ??
        findMatchingDefaultColorPalette(Object.values(form.values));

    const activeColorPaletteOrDefault =
        activeColorPalette ?? defaultColorPalettes[0];

    const setFormValuesFromColorPalette = useCallback(
        (palette: ColorPalette) => {
            setStartingColorPalette(palette);
            const paletteColors = getColorFormFields(palette.colors);

            form.reset();
            form.setValues(paletteColors);
        },
        [form],
    );

    const setFormValuesFromData = useCallback(() => {
        if (data?.chartColors) {
            form.setValues(getColorFormFields(data.chartColors));
            form.resetDirty(getColorFormFields(data.chartColors));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data?.chartColors]);

    useEffect(() => {
        setFormValuesFromData();
    }, [setFormValuesFromData]);

    const renderColorInputLabel = useCallback(
        (colorIndex: number) => {
            const inputKey = `color${colorIndex + 1}`;
            const formColor = form.values[inputKey];
            const defaultColor = activeColorPaletteOrDefault.colors[colorIndex];
            const differsFromDefault =
                formColor != null &&
                defaultColor != null &&
                defaultColor !== formColor;

            return (
                <Group mb="xxs">
                    <Text size={'xs'} color="gray">
                        Color {colorIndex + 1}
                    </Text>
                    {differsFromDefault && (
                        <Tooltip label="Restore default color">
                            <ActionIcon
                                size="xs"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    form.setFieldValue(inputKey, defaultColor);
                                }}
                            >
                                <MantineIcon icon={IconRestore} />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
            );
        },
        [form, activeColorPaletteOrDefault],
    );

    const handleOnSubmit = form.onSubmit((newColors) => {
        if (data) {
            const {
                needsProject: _needsProject,
                organizationUuid: _organizationUuid,
                ...params
            } = data;
            updateMutation.mutate({
                ...params,
                chartColors: Object.values(newColors),
            });
        }
    });

    if (isOrgLoading) {
        return <Loader color="dark" />;
    }

    return (
        <Stack spacing="md">
            <Flex justify="space-between">
                <Stack spacing="xs">
                    <Title order={5}>Default chart colors</Title>
                    <Text c="gray.6" fz="xs">
                        Start from a pre-defined theme, or create your own color
                        palette.
                    </Text>
                </Stack>
                <Popover position="bottom-end">
                    <Popover.Target>
                        <Button
                            size="sm"
                            leftIcon={<MantineIcon icon={IconChevronDown} />}
                        >
                            Color themes
                        </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Card>
                            <Stack spacing={'xs'}>
                                {defaultColorPalettes.map((palette) => (
                                    <ColorPalettePreview
                                        palette={palette}
                                        key={palette.name}
                                        onSelect={() =>
                                            setFormValuesFromColorPalette(
                                                palette,
                                            )
                                        }
                                        isActive={
                                            activeColorPalette?.name ===
                                            palette.name
                                        }
                                    />
                                ))}
                            </Stack>
                        </Card>
                    </Popover.Dropdown>
                </Popover>
            </Flex>
            <form onSubmit={handleOnSubmit}>
                <Stack spacing="md" mb="lg">
                    <SimpleGrid cols={4}>
                        {Object.values(form.values).map((_color, index) => (
                            <ColorInput
                                key={index}
                                width="100%"
                                placeholder="Enter hex color"
                                label={renderColorInputLabel(index)}
                                swatches={activeColorPaletteOrDefault.colors}
                                disabled={ability.cannot(
                                    'update',
                                    subject('Organization', {
                                        organizationUuid:
                                            data?.organizationUuid,
                                    }),
                                )}
                                {...form.getInputProps(`color${index + 1}`)}
                                onBlur={() => {
                                    form.validateField(`color${index + 1}`);
                                }}
                            />
                        ))}
                    </SimpleGrid>
                    <Can
                        I={'update'}
                        this={subject('Organization', {
                            organizationUuid: data?.organizationUuid,
                        })}
                    >
                        <Flex justify="flex-end" gap="sm">
                            {form.isDirty() && (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setFormValuesFromData();
                                    }}
                                >
                                    Cancel
                                </Button>
                            )}
                            <Button
                                type="submit"
                                loading={updateMutation.isLoading}
                                disabled={!form.isDirty()}
                            >
                                Save changes
                            </Button>
                        </Flex>
                    </Can>
                </Stack>
            </form>
        </Stack>
    );
};

const AppearanceSettingsPanel: FC = () => {
    const { health } = useApp();
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
                        href={`${health.data?.siteHelpdeskUrl}/guides/customizing-the-appearance-of-your-project`}
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
