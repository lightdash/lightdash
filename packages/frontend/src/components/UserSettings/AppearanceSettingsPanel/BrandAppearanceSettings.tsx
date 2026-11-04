import {
    type OrganizationBrand,
    type OrganizationBrandColor,
    type OrganizationBrandFont,
    type OrganizationBrandLogo,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    ColorInput,
    Divider,
    Group,
    Paper,
    Skeleton,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash, IconWand, IconWorld } from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import {
    useColorPalettes,
    useCreateColorPalette,
} from '../../../hooks/appearance/useOrganizationAppearance';
import useHealth from '../../../hooks/health/useHealth';
import {
    findSquareBrandLogo,
    pickBrandLogo,
} from '../../../hooks/organization/brandLogos';
import {
    useFetchOrganizationBrand,
    useOrganizationBrand,
    useSaveOrganizationBrand,
} from '../../../hooks/organization/useOrganizationBrand';
import InlineErrorState from '../../common/InlineErrorState';
import MantineIcon from '../../common/MantineIcon';
import {
    SettingRow,
    SettingsSection,
} from '../../common/Settings/SettingLayout';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { ApplicationBrandPreview } from './ApplicationBrandPreview';
import classes from './BrandAppearanceSettings.module.css';
import { BrandLogoField } from './BrandLogoField';
import { BrandPreview } from './BrandPreview';
import { generateBrandPalette } from './generateBrandPalette';
import { PaletteModalBase } from './PaletteModalBase';

type BrandFormValues = {
    domain: string;
    name: string | null;
    description: string | null;
    logos: OrganizationBrandLogo[];
    colors: OrganizationBrandColor[];
    fonts: OrganizationBrandFont[];
};

const brandToForm = (brand: OrganizationBrand | null): BrandFormValues => ({
    domain: brand?.domain ?? '',
    name: brand?.name ?? null,
    description: brand?.description ?? null,
    logos: brand?.logos ?? [],
    colors: brand?.colors ?? [],
    fonts: brand?.fonts ?? [],
});

const BrandAppearanceForm: FC<{
    brand: OrganizationBrand | null;
    canFetchBrand: boolean;
    canWhiteLabel: boolean;
    canManageColorPalette: boolean;
}> = ({ brand, canFetchBrand, canWhiteLabel, canManageColorPalette }) => {
    const fetchMutation = useFetchOrganizationBrand();
    const saveMutation = useSaveOrganizationBrand();
    const [generatedPalette, setGeneratedPalette] = useState<string[] | null>(
        null,
    );
    const [isPaletteModalOpen, setIsPaletteModalOpen] = useState(false);
    const [logoError, setLogoError] = useState<string | null>(null);
    const [logoImport, setLogoImport] = useState<
        'idle' | 'checking' | 'found' | 'missing'
    >('idle');
    const importRun = useRef(0);
    const { data: palettes = [] } = useColorPalettes();
    const createColorPalette = useCreateColorPalette();
    const form = useForm<BrandFormValues>({
        initialValues: brandToForm(brand),
        validate: {
            colors: {
                hex: (value) =>
                    /^#[0-9a-f]{6}$/i.test(value)
                        ? null
                        : 'Enter a valid hex color',
            },
        },
    });
    const hasValidColors =
        form.values.colors.length > 0 &&
        form.values.colors.every((color) => /^#[0-9a-f]{6}$/i.test(color.hex));

    const handleFetch = () => {
        importRun.current += 1;
        const run = importRun.current;
        setLogoImport('idle');
        fetchMutation.mutate(
            { domain: form.values.domain.trim() },
            {
                onSuccess: async (fetched) => {
                    form.setValues({
                        domain: fetched.domain,
                        colors: fetched.colors,
                    });
                    if (!canWhiteLabel) return;
                    setLogoImport('checking');
                    const logo = await findSquareBrandLogo(fetched.logos);
                    if (run !== importRun.current) return;
                    if (logo) form.setFieldValue('logos', [logo]);
                    setLogoImport(logo ? 'found' : 'missing');
                },
            },
        );
    };
    const isImporting = fetchMutation.isLoading || logoImport === 'checking';

    const handleSave = form.onSubmit((values) => {
        saveMutation.mutate(values, {
            onSuccess: (saved) => {
                const savedValues = brandToForm(saved);
                form.setInitialValues(savedValues);
                form.setValues(savedValues);
                form.resetDirty(savedValues);
            },
        });
    });

    const websiteField = (
        <Stack gap="xs">
            <TextInput
                label="Website"
                placeholder="https://acme.com"
                disabled={saveMutation.isLoading}
                leftSection={<MantineIcon icon={IconWorld} />}
                rightSectionWidth={canFetchBrand ? 144 : undefined}
                rightSectionPointerEvents="all"
                rightSection={
                    canFetchBrand ? (
                        <Tooltip
                            label={
                                canWhiteLabel
                                    ? 'Import your logo and colors from this website. Review them before saving.'
                                    : 'Import your brand colors from this website. Review them before saving.'
                            }
                            events={{ hover: true, focus: true, touch: false }}
                            multiline
                            w={260}
                        >
                            <Button
                                variant="default"
                                size="compact-xs"
                                loading={isImporting}
                                disabled={
                                    !form.values.domain.trim() ||
                                    saveMutation.isLoading
                                }
                                onClick={handleFetch}
                            >
                                {canWhiteLabel
                                    ? 'Import brand identity'
                                    : 'Import brand colors'}
                            </Button>
                        </Tooltip>
                    ) : null
                }
                {...form.getInputProps('domain')}
            />
            {logoImport === 'missing' && !pickBrandLogo(form.values.logos) && (
                <Text size="xs" c="dimmed">
                    Colors imported. No square logo was found; you can upload
                    one below.
                </Text>
            )}
        </Stack>
    );

    return (
        <Stack gap="lg">
            {canWhiteLabel && (
                <SettingsSection
                    label="Brand identity"
                    description="Make your workspace recognizable with your name and logo."
                >
                    <SettingsCard>
                        <Box className={classes.grid}>
                            <Stack gap="lg">
                                {websiteField}
                                <TextInput
                                    label="Name"
                                    placeholder="Acme Analytics"
                                    value={form.values.name ?? ''}
                                    disabled={saveMutation.isLoading}
                                    onChange={(event) =>
                                        form.setFieldValue(
                                            'name',
                                            event.currentTarget.value || null,
                                        )
                                    }
                                />
                                <BrandLogoField
                                    logos={form.values.logos}
                                    brandName={form.values.name}
                                    disabled={saveMutation.isLoading}
                                    onChange={(logos) =>
                                        form.setFieldValue('logos', logos)
                                    }
                                    onErrorChange={setLogoError}
                                />
                            </Stack>
                            <Stack gap="sm" className={classes.identityPreview}>
                                <Text fz="xs" c="dimmed">
                                    Preview
                                </Text>
                                <ApplicationBrandPreview
                                    name={form.values.name}
                                    logos={form.values.logos}
                                />
                            </Stack>
                        </Box>
                    </SettingsCard>
                </SettingsSection>
            )}

            <SettingsSection
                label="Brand colors"
                description="The colors that represent your brand."
            >
                <SettingsCard>
                    <Stack gap="md">
                        <Box className={classes.grid}>
                            <Stack gap="md">
                                {!canWhiteLabel &&
                                    canFetchBrand &&
                                    websiteField}
                                {form.values.colors.length > 0 && (
                                    <Box className={classes.colorsList}>
                                        {form.values.colors.map(
                                            (color, index) => (
                                                <Group
                                                    key={index}
                                                    gap={0}
                                                    wrap="nowrap"
                                                    className={classes.colorRow}
                                                >
                                                    <Box
                                                        className={
                                                            classes.colorCombo
                                                        }
                                                    >
                                                        <ColorInput
                                                            aria-label={`Brand color ${index + 1}`}
                                                            format="hex"
                                                            withEyeDropper={
                                                                false
                                                            }
                                                            size="xs"
                                                            variant="unstyled"
                                                            className={
                                                                classes.colorInput
                                                            }
                                                            disabled={
                                                                saveMutation.isLoading
                                                            }
                                                            {...form.getInputProps(
                                                                `colors.${index}.hex`,
                                                            )}
                                                        />
                                                    </Box>
                                                    <Tooltip label="Remove color">
                                                        <ActionIcon
                                                            className={
                                                                classes.removeColor
                                                            }
                                                            aria-label={`Remove brand color ${index + 1}`}
                                                            disabled={
                                                                saveMutation.isLoading
                                                            }
                                                            onClick={() =>
                                                                form.removeListItem(
                                                                    'colors',
                                                                    index,
                                                                )
                                                            }
                                                        >
                                                            <MantineIcon
                                                                icon={IconTrash}
                                                            />
                                                        </ActionIcon>
                                                    </Tooltip>
                                                </Group>
                                            ),
                                        )}
                                    </Box>
                                )}
                                {form.values.colors.length === 0 && (
                                    <Paper variant="dotted" p="md">
                                        <Text fz="sm" c="dimmed">
                                            Add your first brand color to get
                                            started.
                                        </Text>
                                    </Paper>
                                )}
                                <Button
                                    variant="default"
                                    className={classes.addColor}
                                    leftSection={
                                        <MantineIcon icon={IconPlus} />
                                    }
                                    disabled={saveMutation.isLoading}
                                    onClick={() =>
                                        form.insertListItem('colors', {
                                            hex: '#000000',
                                            type: 'brand',
                                            brightness: null,
                                        })
                                    }
                                >
                                    Add color
                                </Button>
                            </Stack>
                            <Stack gap="sm" className={classes.previewColumn}>
                                <Text fz="xs" c="dimmed">
                                    Chart color preview
                                </Text>
                                <BrandPreview
                                    name={null}
                                    logos={[]}
                                    colors={form.values.colors}
                                    titleFont={null}
                                    bodyFont={null}
                                    paletteColors={form.values.colors
                                        .map((color) => color.hex)
                                        .filter((hex) =>
                                            /^#[0-9a-f]{6}$/i.test(hex),
                                        )}
                                />
                            </Stack>
                        </Box>
                        {canManageColorPalette && (
                            <>
                                <Divider />
                                <SettingRow
                                    title="Chart palette from your brand"
                                    description="Turn these colors into a balanced palette for your charts. You can review it before adding it."
                                    control={
                                        <Button
                                            variant="default"
                                            size="xs"
                                            leftSection={
                                                <MantineIcon icon={IconWand} />
                                            }
                                            disabled={!hasValidColors}
                                            onClick={() => {
                                                setGeneratedPalette(
                                                    generateBrandPalette(
                                                        form.values.colors.map(
                                                            (color) =>
                                                                color.hex,
                                                        ),
                                                    ),
                                                );
                                                setIsPaletteModalOpen(true);
                                            }}
                                        >
                                            Generate palette
                                        </Button>
                                    }
                                />
                            </>
                        )}
                    </Stack>
                </SettingsCard>
            </SettingsSection>

            {form.isDirty() && (
                <SettingsCard p="md" className={classes.footer}>
                    <Group justify="space-between" role="status">
                        <Group gap="xs">
                            <Box className={classes.unsavedDot} />
                            <Text fz="sm" c="yellow.7" fw={500}>
                                Unsaved changes
                            </Text>
                        </Group>
                        <Group gap="sm">
                            <Button
                                variant="default"
                                onClick={() => form.reset()}
                                disabled={saveMutation.isLoading}
                            >
                                Revert
                            </Button>
                            <Button
                                onClick={() => handleSave()}
                                loading={saveMutation.isLoading}
                                disabled={logoError !== null || isImporting}
                            >
                                Save changes
                            </Button>
                        </Group>
                    </Group>
                </SettingsCard>
            )}

            {generatedPalette && (
                <PaletteModalBase
                    key={generatedPalette.join('-')}
                    opened={isPaletteModalOpen}
                    onClose={() => setIsPaletteModalOpen(false)}
                    onSubmit={(values) => {
                        if (!values.name) return;
                        createColorPalette.mutate(
                            {
                                name: values.name,
                                colors: values.colors,
                                darkColors: values.darkColors,
                            },
                            { onSuccess: () => setIsPaletteModalOpen(false) },
                        );
                    }}
                    isLoading={createColorPalette.isLoading}
                    initialValues={{ name: '', colors: generatedPalette }}
                    title="Chart palette from your brand"
                    submitButtonText="Create palette"
                    existingPaletteNames={palettes.map(
                        (palette) => palette.name,
                    )}
                />
            )}
        </Stack>
    );
};

export const BrandAppearanceSettings: FC<{
    canManageColorPalette: boolean;
}> = ({ canManageColorPalette }) => {
    const { data: health } = useHealth();
    const canWhiteLabel = !!health?.license?.valid;
    const canFetchBrand = !!health?.hasBrandfetch;
    const {
        data: brand,
        isInitialLoading,
        isError,
        refetch,
    } = useOrganizationBrand();

    if (isInitialLoading) {
        return (
            <SettingsCard>
                <Skeleton height={240} />
            </SettingsCard>
        );
    }
    if (isError) {
        return (
            <InlineErrorState
                message="Unable to load brand appearance"
                onRetry={() => void refetch()}
            />
        );
    }
    // Without white-labelling only the color import is left, so hide the
    // section when Brandfetch is off and no brand was saved before
    if (!canWhiteLabel && !canFetchBrand && !brand) return null;

    return (
        <BrandAppearanceForm
            brand={brand ?? null}
            canFetchBrand={canFetchBrand}
            canWhiteLabel={canWhiteLabel}
            canManageColorPalette={canManageColorPalette}
        />
    );
};
