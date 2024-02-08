import { subject } from '@casl/ability';
import {
    ActionIcon,
    Button,
    ColorInput,
    ColorSwatch,
    Flex,
    Group,
    Loader,
    SimpleGrid,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconInfoCircle, IconRestore } from '@tabler/icons-react';
import { isEqual } from 'lodash';
import { FC, useCallback, useEffect } from 'react';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationUpdateMutation } from '../../../hooks/organization/useOrganizationUpdateMutation';
import { isHexCodeColor } from '../../../utils/colorUtils';
import { Can, useAbilityContext } from '../../common/Authorization';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';

interface ColorPalette {
    name: string;
    colors: string[];
}

const defaultColorPalettes: ColorPalette[] = [
    {
        name: 'Lightdash Defaults',
        colors: [
            '#ff5733',
            '#ff8933',
            '#ffbd33',
            '#ffe133',
            '#e8ff33',
            '#b4ff33',
            '#80ff33',
            '#4cff33',
            '#33ff49',
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
        name: 'Sunrise Serenity Palette',
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
        name: 'Pastel Dream Palette',
        colors: [
            '#A8C1B4',
            '#ACC6B8',
            '#B0CBBB',
            '#B5D0BF',
            '#B9D5C3',
            '#BDDAC6',
            '#C1DFCA',
            '#C5E4CE',
            '#CAE8D2',
            '#CEECD5',
            '#D2F1D9',
            '#D6F6DD',
            '#DBFAE1',
            '#DFFEE5',
            '#E3FFE9',
            '#E7FFED',
            '#ECFFF1',
            '#F0FFF4',
            '#F4FFF8',
            '#F8FFFC',
        ],
    },
    {
        name: 'Autumn Sunset Palette',
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
        name: 'Oceanic Blues Palette',
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
        name: 'Earthy Tones Palette',
        colors: [
            '#594E42',
            '#6D6155',
            '#816B68',
            '#957E7B',
            '#A9928E',
            '#BDA5A1',
            '#D1B9B4',
            '#E5CCC7',
            '#F9E0DA',
            '#FFEBE4',
            '#FFF5EE',
            '#FFFAF7',
            '#FAF5EF',
            '#EDE8E0',
            '#E0DCD2',
            '#D3D0C5',
            '#C6C1B8',
            '#B9B4AA',
            '#ACA89D',
            '#9F9F91',
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
    const stops = getColorPaletteColorStops(palette, 5);
    const { name } = palette;

    return (
        <Group key={name} spacing="lg">
            <Text size="sm">{name}</Text>

            <Group spacing={'xxs'}>
                {stops.map((color) => (
                    <ColorSwatch color={color} key={color} />
                ))}
            </Group>
            <Button size="xs" disabled={isActive} onClick={onSelect}>
                Use this theme
            </Button>
        </Group>
    );
};

const AppearanceColorSettings: FC = () => {
    const ability = useAbilityContext();
    const { isInitialLoading: isOrgLoading, data } = useOrganization();
    const updateMutation = useOrganizationUpdateMutation();
    const colorFormFields = getColorFormFields(defaultColorPalettes[0].colors);

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

    const activeColorPalette = findMatchingDefaultColorPalette(
        Object.values(form.values),
    );

    const activeColorPaletteOrDefault =
        activeColorPalette ?? defaultColorPalettes[0];

    const setFormValuesFromColorPalette = useCallback(
        (palette: ColorPalette) => {
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
            <Title order={5}>Default chart colors</Title>
            <Stack spacing={'sm'}>
                {defaultColorPalettes.map((palette) => (
                    <ColorPalettePreview
                        palette={palette}
                        key={palette.name}
                        onSelect={() => setFormValuesFromColorPalette(palette)}
                        isActive={activeColorPalette?.name === palette.name}
                    />
                ))}
            </Stack>

            <form onSubmit={handleOnSubmit}>
                <Stack spacing="xs">
                    <SimpleGrid cols={3}>
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
