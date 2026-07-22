import { generatePaletteFromBrandColors } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconChevronDown,
    IconInfoCircle,
    IconPalette,
    IconPlus,
    IconSparkles,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import {
    useColorPalettes,
    useSetActiveColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useOrganizationBrand } from '../../../hooks/organization/useOrganizationBrand';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { BrandAppearanceSettings } from './BrandAppearanceSettings';
import { CreatePaletteModal } from './CreatePaletteModal';
import { type PaletteFormValues } from './PaletteModalBase';
import { PaletteItem } from './PaletteItem';

const AppearanceColorSettings: FC = () => {
    const { data: organization } = useOrganization();
    const { data: health, isLoading: isHealthLoading } = useHealth();
    const { data: palettes = [], isLoading: isPalettesLoading } =
        useColorPalettes();
    const { data: brand } = useOrganizationBrand();

    const setActivePalette = useSetActiveColorPalette();

    const [createModalValues, setCreateModalValues] = useState<{
        initialValues?: PaletteFormValues;
        title: string;
    } | null>(null);

    const handleSetActive = useCallback(
        (uuid: string) => {
            setActivePalette.mutate(uuid);
        },
        [setActivePalette],
    );

    const brandPalette = useMemo(
        () => generatePaletteFromBrandColors(brand?.colors ?? []),
        [brand?.colors],
    );
    const hasBrandColors = brandPalette.colors.length > 0;
    const brandName = brand?.name ?? 'brand';

    const openCustomPalette = useCallback(() => {
        setCreateModalValues({ title: 'Create new palette' });
    }, []);

    const openBrandPalette = useCallback(() => {
        setCreateModalValues({
            title: 'Create palette from brand colors',
            initialValues: {
                name: `${brand?.name ?? 'Brand'} palette`,
                colors: brandPalette.colors,
                darkColors: brandPalette.darkColors,
            },
        });
    }, [brand?.name, brandPalette]);

    const hasColorPaletteOverride =
        health?.appearance.overrideColorPalette &&
        health.appearance.overrideColorPalette.length > 0;

    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Text size="sm" c="ldGray.6">
                    Customize the color palettes used in your charts and
                    visualizations.
                </Text>

                {hasBrandColors ? (
                    <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                            <Button
                                leftSection={<MantineIcon icon={IconPlus} />}
                                rightSection={
                                    <MantineIcon icon={IconChevronDown} />
                                }
                                variant="default"
                                size="xs"
                                style={{ alignSelf: 'flex-end' }}
                                disabled={hasColorPaletteOverride}
                            >
                                Add new palette
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconSparkles} />
                                }
                                onClick={openBrandPalette}
                            >
                                <Text size="sm">From brand colors</Text>
                                <Text size="xs" c="dimmed">
                                    Generate from {brandName}
                                </Text>
                            </Menu.Item>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconPalette} />}
                                onClick={openCustomPalette}
                            >
                                <Text size="sm">Custom palette</Text>
                                <Text size="xs" c="dimmed">
                                    Start from scratch & pick each color
                                </Text>
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                ) : (
                    <Button
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={openCustomPalette}
                        variant="default"
                        size="xs"
                        style={{ alignSelf: 'flex-end' }}
                        disabled={hasColorPaletteOverride}
                    >
                        Add new palette
                    </Button>
                )}
            </Group>

            <Stack gap="xs">
                {isPalettesLoading || isHealthLoading ? (
                    <>
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                        <Skeleton height={30} />
                    </>
                ) : (
                    <>
                        {hasColorPaletteOverride &&
                            health?.appearance.overrideColorPalette &&
                            organization?.organizationUuid && (
                                <PaletteItem
                                    palette={{
                                        colorPaletteUuid: 'custom',
                                        createdAt: new Date(),
                                        name:
                                            health.appearance
                                                .overrideColorPaletteName ??
                                            'Custom override',
                                        colors: health.appearance
                                            .overrideColorPalette,
                                        darkColors: null,
                                        organizationUuid:
                                            organization?.organizationUuid,
                                    }}
                                    isActive={true}
                                    readOnly
                                    onSetActive={undefined}
                                />
                            )}
                        {palettes.map((palette) => (
                            <PaletteItem
                                key={palette.colorPaletteUuid}
                                palette={palette}
                                isActive={
                                    palette.isActive && !hasColorPaletteOverride
                                }
                                onSetActive={
                                    hasColorPaletteOverride
                                        ? undefined
                                        : handleSetActive
                                }
                            />
                        ))}
                    </>
                )}
            </Stack>

            <CreatePaletteModal
                key={`create-palette-modal-${createModalValues?.title ?? ''}`}
                opened={createModalValues !== null}
                onClose={() => {
                    setCreateModalValues(null);
                }}
                initialValues={createModalValues?.initialValues}
                title={createModalValues?.title}
            />
        </Stack>
    );
};

const AppearanceSettingsPanel: FC = () => {
    return (
        <Stack gap="sm">
            <Group gap="xxs">
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
                        size="xs"
                        color="gray"
                        variant="subtle"
                    >
                        <MantineIcon icon={IconInfoCircle} />
                    </ActionIcon>
                </Tooltip>
            </Group>
            <BrandAppearanceSettings />
            <SettingsCard mb="lg">
                <AppearanceColorSettings />
            </SettingsCard>
        </Stack>
    );
};

export default AppearanceSettingsPanel;
