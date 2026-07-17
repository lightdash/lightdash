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
    Group,
    Select,
    Skeleton,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconPlus,
    IconRefresh,
    IconTrash,
    IconWorld,
} from '@tabler/icons-react';
import { type FC } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import {
    useFetchOrganizationBrand,
    useOrganizationBrand,
    useSaveOrganizationBrand,
} from '../../../hooks/organization/useOrganizationBrand';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import classes from './BrandAppearanceSettings.module.css';
import { BrandPreview } from './BrandPreview';

const BRAND_COLOR_TYPES = ['accent', 'brand', 'dark', 'light', 'other'];

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

const capitalize = (value: string) =>
    value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const getColorTypeOptions = (currentType: string) =>
    (BRAND_COLOR_TYPES.includes(currentType)
        ? BRAND_COLOR_TYPES
        : [...BRAND_COLOR_TYPES, currentType]
    ).map((type) => ({ value: type, label: capitalize(type) }));

const LogoTile: FC<{
    label: string;
    dark: boolean;
    logo: OrganizationBrandLogo | undefined;
    name: string;
}> = ({ label, dark, logo, name }) => (
    <Stack gap="two" align="center">
        <Box className={dark ? classes.logoTileDark : classes.logoTile}>
            {logo ? (
                <img
                    src={logo.url}
                    alt={`${name} ${label} logo`}
                    className={classes.logoImage}
                />
            ) : (
                <Text size="sm" c="dimmed">
                    No logo
                </Text>
            )}
        </Box>
        <Text size="xs" c="dimmed">
            {label}
        </Text>
    </Stack>
);

const BrandAppearanceForm: FC<{ brand: OrganizationBrand | null }> = ({
    brand,
}) => {
    const fetchMutation = useFetchOrganizationBrand();
    const saveMutation = useSaveOrganizationBrand();

    const form = useForm<BrandFormValues>({
        initialValues: brandToForm(brand),
    });

    const savedDomain = brand?.domain ?? '';
    const domainChanged =
        form.values.domain.trim().toLowerCase() !== savedDomain;
    const isDirty = form.isDirty();

    const handleRefresh = async () => {
        const domain = form.values.domain.trim();
        if (domain.length === 0) return;
        const fetched = await fetchMutation.mutateAsync({ domain });
        form.setValues(brandToForm(fetched));
    };

    const handleSave = () => {
        saveMutation.mutate({
            domain: form.values.domain,
            name: form.values.name,
            description: form.values.description,
            logos: form.values.logos,
            colors: form.values.colors,
            fonts: form.values.fonts,
        });
    };

    // Brandfetch's logo `theme` describes the artwork colour, not the
    // background it belongs on: `light` is a light/white logo (meant for dark
    // backgrounds) and `dark` is a dark logo (meant for light backgrounds).
    // Pair each with a contrasting tile so neither disappears into it.
    const logoForLightBg =
        form.values.logos.find((logo) => logo.theme === 'dark') ??
        form.values.logos.find((logo) => logo.theme === null) ??
        form.values.logos[0];
    const logoForDarkBg =
        form.values.logos.find((logo) => logo.theme === 'light') ??
        form.values.logos[0];

    const titleFont =
        form.values.fonts.find((font) => font.type === 'title') ?? null;
    const bodyFont =
        form.values.fonts.find((font) => font.type === 'body') ?? null;

    return (
        <Stack gap="lg">
            <Box className={classes.grid}>
                <Stack gap="md">
                    <TextInput
                        label="Brand domain"
                        placeholder="acme.com"
                        leftSection={<MantineIcon icon={IconWorld} />}
                        {...form.getInputProps('domain')}
                        rightSection={
                            <Tooltip
                                label="Fetch brand from this domain"
                                position="top"
                            >
                                <ActionIcon
                                    variant="subtle"
                                    color={domainChanged ? 'blue' : 'gray'}
                                    loading={fetchMutation.isLoading}
                                    onClick={() => void handleRefresh()}
                                    aria-label="Fetch brand from domain"
                                >
                                    <MantineIcon icon={IconRefresh} />
                                </ActionIcon>
                            </Tooltip>
                        }
                    />

                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            Logo
                        </Text>
                        <Group gap="sm" grow>
                            <LogoTile
                                label="Light"
                                dark={false}
                                logo={logoForLightBg}
                                name={form.values.name ?? 'Brand'}
                            />
                            <LogoTile
                                label="Dark"
                                dark
                                logo={logoForDarkBg}
                                name={form.values.name ?? 'Brand'}
                            />
                        </Group>
                    </Stack>

                    <Group gap="sm" grow align="flex-start">
                        <Select
                            label="Title font"
                            placeholder="—"
                            data={titleFont ? [titleFont.name] : []}
                            value={titleFont?.name ?? null}
                            disabled
                        />
                        <Select
                            label="Body font"
                            placeholder="—"
                            data={bodyFont ? [bodyFont.name] : []}
                            value={bodyFont?.name ?? null}
                            disabled
                        />
                    </Group>

                    <Stack gap="xs">
                        <Box>
                            <Text size="sm" fw={500}>
                                Brand colors
                            </Text>
                            <Text size="xs" c="dimmed">
                                Roles are auto-classified by Brandfetch. Edit
                                any value or role.
                            </Text>
                        </Box>

                        <Stack gap="xs">
                            {form.values.colors.map((color, index) => (
                                <Group
                                    key={index}
                                    gap="xs"
                                    wrap="nowrap"
                                    className={classes.colorRow}
                                >
                                    <Box className={classes.colorCombo}>
                                        <ColorInput
                                            value={color.hex}
                                            onChange={(hex) =>
                                                form.setFieldValue(
                                                    `colors.${index}.hex`,
                                                    hex,
                                                )
                                            }
                                            format="hex"
                                            size="xs"
                                            variant="unstyled"
                                            withEyeDropper={false}
                                            className={classes.colorInput}
                                        />
                                        <Select
                                            data={getColorTypeOptions(
                                                color.type,
                                            )}
                                            value={color.type}
                                            onChange={(type) =>
                                                type &&
                                                form.setFieldValue(
                                                    `colors.${index}.type`,
                                                    type,
                                                )
                                            }
                                            allowDeselect={false}
                                            size="xs"
                                            variant="unstyled"
                                            className={classes.colorTypeSelect}
                                        />
                                    </Box>
                                    <Tooltip
                                        label="Remove color"
                                        position="top"
                                    >
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            className={classes.removeColor}
                                            onClick={() =>
                                                form.removeListItem(
                                                    'colors',
                                                    index,
                                                )
                                            }
                                            aria-label="Remove color"
                                        >
                                            <MantineIcon icon={IconTrash} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            ))}

                            <Button
                                variant="default"
                                leftSection={<MantineIcon icon={IconPlus} />}
                                className={classes.addColor}
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
                    </Stack>
                </Stack>

                <Stack gap="xs">
                    <Text size="sm" c="dimmed">
                        Preview
                    </Text>
                    <BrandPreview
                        name={form.values.name}
                        logos={form.values.logos}
                        colors={form.values.colors}
                        titleFont={titleFont}
                        bodyFont={bodyFont}
                    />
                </Stack>
            </Box>

            {isDirty && (
                <Group justify="space-between" className={classes.footer}>
                    <Group gap="xs">
                        <Box className={classes.unsavedDot} />
                        <Text size="sm" c="yellow.7" fw={500}>
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
                            onClick={handleSave}
                            loading={saveMutation.isLoading}
                        >
                            Save changes
                        </Button>
                    </Group>
                </Group>
            )}
        </Stack>
    );
};

export const BrandAppearanceSettings: FC = () => {
    const { data: brand, isInitialLoading } = useOrganizationBrand();
    const { data: health } = useHealth();

    if (isInitialLoading) {
        return (
            <SettingsCard mb="lg">
                <Stack gap="md">
                    <Skeleton height={40} />
                    <Skeleton height={200} />
                </Stack>
            </SettingsCard>
        );
    }

    // Only show the section when brand detection is available or a brand has
    // already been stored — otherwise there is nothing the user can do here.
    if (!health?.hasBrandfetch && !brand) {
        return null;
    }

    return (
        <SettingsCard mb="lg">
            <Stack gap="md">
                <Box>
                    <Text fw={600}>Brand appearance</Text>
                    <Text size="sm" c="dimmed">
                        Your brand can be used to generate color palettes.
                    </Text>
                </Box>
                <BrandAppearanceForm
                    key={brand ? String(brand.updatedAt) : 'empty'}
                    brand={brand ?? null}
                />
            </Stack>
        </SettingsCard>
    );
};
