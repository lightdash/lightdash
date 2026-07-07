import { subject } from '@casl/ability';
import { type OrganizationBrand } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Center,
    ColorSwatch,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useState, type FC, type FormEvent } from 'react';
import ForbiddenPanel from '../components/ForbiddenPanel';
import { useOrganization } from '../hooks/organization/useOrganization';
import {
    useOrganizationBrand,
    useOrganizationBrandUpdateMutation,
} from '../hooks/organization/useOrganizationBrand';
import useApp from '../providers/App/useApp';
import classes from './BrandPrototype.module.css';
import {
    deriveBrandTheme,
    isValidHexColor,
    type DerivedBrandTheme,
} from './brandPrototypeTheme';

const LOGO_TYPE_PRIORITY = ['icon', 'symbol', 'logo', 'other'];
const LOGO_FORMAT_PRIORITY = ['svg', 'png', 'jpeg', 'jpg', 'webp'];

const pickLogoUrl = (brand: OrganizationBrand | null | undefined) => {
    if (!brand || brand.logos.length === 0) return null;
    const sorted = [...brand.logos].sort((a, b) => {
        const typeDiff =
            LOGO_TYPE_PRIORITY.indexOf(a.type) -
            LOGO_TYPE_PRIORITY.indexOf(b.type);
        if (typeDiff !== 0) return typeDiff;
        // Prefer dark-theme assets — they are designed for light backgrounds
        const themeDiff =
            (a.theme === 'dark' ? 0 : 1) - (b.theme === 'dark' ? 0 : 1);
        if (themeDiff !== 0) return themeDiff;
        return (
            LOGO_FORMAT_PRIORITY.indexOf(a.format ?? '') -
            LOGO_FORMAT_PRIORITY.indexOf(b.format ?? '')
        );
    });
    return sorted[0].url;
};

const getBrandSwatches = (brand: OrganizationBrand) => {
    // Accent/brand colors first, then the rest
    const prioritized = [...brand.colors].sort((a, b) => {
        const rank = (type: string) =>
            type === 'accent' || type === 'brand' ? 0 : 1;
        return rank(a.type) - rank(b.type);
    });
    return [
        ...new Set(
            prioritized
                .map((color) => color.hex)
                .filter((hex) => isValidHexColor(hex)),
        ),
    ].slice(0, 6);
};

const KPIS = [
    { label: 'ARR', value: '$4.2M', delta: '+12%' },
    { label: 'Users', value: '18.3k', delta: '+4%' },
    { label: 'Churn', value: '2.1%', delta: '-0.3%' },
];
const BAR_VALUES = [62, 88, 45, 73, 54, 91, 38];
const LINE_SERIES = [
    [20, 35, 28, 50, 42, 60, 55],
    [10, 18, 25, 22, 34, 30, 44],
    [40, 30, 32, 25, 20, 26, 18],
];
const SEGMENT_LABELS = ['ent', 'mid', 'smb', 'plg'];

const linePath = (points: number[]) => {
    const width = 300;
    const height = 70;
    const max = Math.max(...points);
    return points
        .map((point, i) => {
            const x = (i / (points.length - 1)) * width;
            const y = height - (point / max) * height * 0.9 - 4;
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');
};

const PaletteSection: FC<{ label: string; colors: string[] }> = ({
    label,
    colors,
}) => (
    <Stack gap={6}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            {label}
        </Text>
        <Box className={classes.paletteBar}>
            {colors.map((color, index) => (
                <Box
                    key={`step-${index}`}
                    className={classes.paletteBarStep}
                    bg={color}
                />
            ))}
        </Box>
    </Stack>
);

const AppPreview: FC<{
    theme: DerivedBrandTheme;
    orgName: string;
    logoUrl: string | null;
}> = ({ theme, orgName, logoUrl }) => {
    const { tokens, categorical, sequential } = theme;
    const heatmap = Array.from(
        { length: 24 },
        (_, i) => sequential[Math.floor((i / 24) * sequential.length)],
    );
    return (
        <Paper className={classes.previewCard}>
            <Box className={classes.previewHeader} bg={tokens.headerBg}>
                <Group gap="xs">
                    <Box className={classes.previewLogo}>
                        {logoUrl ? (
                            <img
                                src={logoUrl}
                                alt={orgName}
                                className={classes.previewLogoImage}
                            />
                        ) : (
                            <Text size="xs" fw={700} c={tokens.headerBg}>
                                {(orgName[0] ?? 'A').toUpperCase()}
                            </Text>
                        )}
                    </Box>
                    <Text size="sm" fw={600} c={tokens.headerText}>
                        {orgName}
                    </Text>
                </Group>
                <Text size="xs" c={tokens.headerText} opacity={0.85}>
                    Revenue overview
                </Text>
            </Box>
            <Box className={classes.previewBody} bg={tokens.appBg}>
                <Box className={classes.kpiRow}>
                    {KPIS.map((kpi) => (
                        <Box
                            key={kpi.label}
                            className={classes.kpiCard}
                            bg={tokens.cardBg}
                            bd={`1px solid ${tokens.line}`}
                        >
                            <Text fz={10} c={tokens.sub} tt="uppercase">
                                {kpi.label}
                            </Text>
                            <Text fz={19} fw={600} c={tokens.text}>
                                {kpi.value}
                            </Text>
                            <Text fz={10} c={tokens.sub}>
                                {kpi.delta}
                            </Text>
                        </Box>
                    ))}
                </Box>
                <Box className={classes.chartsRow}>
                    <Box
                        className={classes.previewChartCard}
                        bg={tokens.cardBg}
                        bd={`1px solid ${tokens.line}`}
                    >
                        <Text size="xs" c={tokens.sub} mb={10}>
                            By segment
                        </Text>
                        <Box className={classes.barsRow}>
                            {BAR_VALUES.map((value, index) => (
                                <Box
                                    key={`bar-${index}`}
                                    className={classes.previewBar}
                                    h={`${value}%`}
                                    bg={categorical[index % categorical.length]}
                                />
                            ))}
                        </Box>
                        <Box className={classes.legendRow}>
                            {SEGMENT_LABELS.map((label, index) => (
                                <Group key={label} gap={4}>
                                    <Box
                                        className={classes.legendDot}
                                        bg={categorical[index]}
                                    />
                                    <Text fz={10} c={tokens.sub}>
                                        {label}
                                    </Text>
                                </Group>
                            ))}
                        </Box>
                    </Box>
                    <Box
                        className={classes.previewChartCard}
                        bg={tokens.cardBg}
                        bd={`1px solid ${tokens.line}`}
                    >
                        <Text size="xs" c={tokens.sub} mb={8}>
                            Trend
                        </Text>
                        <svg viewBox="0 0 300 70" width="100%" height="70">
                            {LINE_SERIES.map((series, index) => (
                                <path
                                    key={`series-${index}`}
                                    d={linePath(series)}
                                    fill="none"
                                    stroke={categorical[index]}
                                    strokeWidth={2}
                                />
                            ))}
                        </svg>
                        <Text size="xs" c={tokens.sub} mt={10} mb={5}>
                            Activity
                        </Text>
                        <Box className={classes.heatmapRow}>
                            {heatmap.map((color, index) => (
                                <Box
                                    key={`cell-${index}`}
                                    className={classes.heatCell}
                                    bg={color}
                                />
                            ))}
                        </Box>
                    </Box>
                </Box>
                <Group>
                    <Button
                        size="xs"
                        variant="filled"
                        color={tokens.btnBg}
                        c={tokens.btnText}
                    >
                        Run a query
                    </Button>
                </Group>
            </Box>
        </Paper>
    );
};

const BrandPrototype: FC = () => {
    const { user } = useApp();
    const { data: organization } = useOrganization();
    const { data: brand, isInitialLoading: isLoadingBrand } =
        useOrganizationBrand();
    const brandUpdateMutation = useOrganizationBrandUpdateMutation();

    const [domainInput, setDomainInput] = useState('');
    const [selectedColor, setSelectedColor] = useState<string | null>(null);

    const brandSwatches = brand ? getBrandSwatches(brand) : [];
    const primarySeed = brandSwatches.includes(selectedColor ?? '')
        ? selectedColor!
        : brandSwatches[0];
    const seedHexes = primarySeed
        ? [
              primarySeed,
              ...brandSwatches.filter((hex) => hex !== primarySeed),
          ].slice(0, 3)
        : [];
    const theme = deriveBrandTheme(seedHexes);

    const logoUrl = pickLogoUrl(brand);
    const orgName = brand?.name ?? organization?.name ?? 'Acme';

    const handleFetchBrand = (event: FormEvent) => {
        event.preventDefault();
        if (domainInput.trim().length === 0) return;
        setSelectedColor(null);
        brandUpdateMutation.mutate({ domain: domainInput });
    };

    if (isLoadingBrand || !user.data) {
        return (
            <Center h="100vh">
                <Loader />
            </Center>
        );
    }

    // Same permission as managing organization color palettes (org admins)
    if (
        user.data.ability.cannot(
            'update',
            subject('Organization', {
                organizationUuid: user.data.organizationUuid,
            }),
        )
    ) {
        return <ForbiddenPanel />;
    }

    return (
        <Box className={classes.root}>
            <Box className={classes.content}>
                <Stack gap="xl">
                    <Group justify="space-between" align="flex-end">
                        <Stack gap={4}>
                            <Group gap="sm">
                                <Title order={3}>Brand theme</Title>
                                <Badge variant="light" color="ldGray">
                                    Prototype
                                </Badge>
                            </Group>
                            <Text c="ldGray.7" size="sm">
                                Fetch a brand, then preview Lightdash themed
                                with palettes derived from it.
                            </Text>
                        </Stack>
                        <form onSubmit={handleFetchBrand}>
                            <Group gap="sm">
                                <TextInput
                                    placeholder="acme.com"
                                    w={220}
                                    value={domainInput}
                                    onChange={(event) =>
                                        setDomainInput(
                                            event.currentTarget.value,
                                        )
                                    }
                                />
                                <Button
                                    type="submit"
                                    loading={brandUpdateMutation.isLoading}
                                    disabled={domainInput.trim().length === 0}
                                >
                                    Fetch brand
                                </Button>
                            </Group>
                        </form>
                    </Group>

                    {brand ? (
                        <Box className={classes.grid}>
                            <Stack gap="lg">
                                <Paper p="lg">
                                    <Stack gap="md">
                                        <Group gap="md">
                                            <Box className={classes.logoTile}>
                                                {logoUrl ? (
                                                    <img
                                                        src={logoUrl}
                                                        alt={orgName}
                                                        className={
                                                            classes.logoTileImage
                                                        }
                                                    />
                                                ) : (
                                                    <Text fw={600}>
                                                        {(
                                                            orgName[0] ?? 'A'
                                                        ).toUpperCase()}
                                                    </Text>
                                                )}
                                            </Box>
                                            <Stack gap={0}>
                                                <Text fw={600}>{orgName}</Text>
                                                <Text size="sm" c="ldGray.6">
                                                    {brand.domain}
                                                </Text>
                                            </Stack>
                                        </Group>
                                        <Stack gap={6}>
                                            <Text
                                                size="xs"
                                                fw={600}
                                                c="dimmed"
                                                tt="uppercase"
                                            >
                                                Primary brand color
                                            </Text>
                                            <Group gap="sm">
                                                {brandSwatches.map((color) => (
                                                    <ColorSwatch
                                                        key={color}
                                                        component="button"
                                                        type="button"
                                                        aria-label={`Select ${color}`}
                                                        color={color}
                                                        size={26}
                                                        className={`${
                                                            classes.swatch
                                                        } ${
                                                            color ===
                                                            primarySeed
                                                                ? classes.swatchSelected
                                                                : ''
                                                        }`}
                                                        onClick={() =>
                                                            setSelectedColor(
                                                                color,
                                                            )
                                                        }
                                                    />
                                                ))}
                                            </Group>
                                        </Stack>
                                    </Stack>
                                </Paper>

                                <Paper p="lg">
                                    <Stack gap="md">
                                        <Stack gap={6}>
                                            <Text
                                                size="xs"
                                                fw={600}
                                                c="dimmed"
                                                tt="uppercase"
                                            >
                                                Categorical
                                            </Text>
                                            <Box className={classes.paletteRow}>
                                                {theme.categorical.map(
                                                    (color) => (
                                                        <Box
                                                            key={color}
                                                            className={
                                                                classes.paletteChip
                                                            }
                                                            bg={color}
                                                        />
                                                    ),
                                                )}
                                            </Box>
                                        </Stack>
                                        <PaletteSection
                                            label="Sequential"
                                            colors={theme.sequential}
                                        />
                                        <PaletteSection
                                            label="Diverging"
                                            colors={theme.diverging}
                                        />
                                        <Text size="xs" c="ldGray.6">
                                            Palettes are derived in OKLCH from
                                            the brand hues — the raw brand
                                            colors aren&apos;t reused as data
                                            colors.
                                        </Text>
                                    </Stack>
                                </Paper>
                            </Stack>

                            <AppPreview
                                theme={theme}
                                orgName={orgName}
                                logoUrl={logoUrl}
                            />
                        </Box>
                    ) : (
                        <Paper p="xl" variant="dotted">
                            <Center mih={200}>
                                <Text c="ldGray.6">
                                    Enter your company website above to fetch
                                    your brand and preview the derived theme.
                                </Text>
                            </Center>
                        </Paper>
                    )}
                </Stack>
            </Box>
        </Box>
    );
};

export default BrandPrototype;
