import { type OrganizationBrand } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Center,
    ColorSwatch,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useState, type FC, type FormEvent } from 'react';
import { useOrganization } from '../hooks/organization/useOrganization';
import {
    useOrganizationBrand,
    useOrganizationBrandUpdateMutation,
} from '../hooks/organization/useOrganizationBrand';
import classes from './BrandPrototype.module.css';

const DEFAULT_THEME_COLORS = [
    '#4263eb',
    '#7950f2',
    '#2f9e44',
    '#f08c00',
    '#e64980',
];

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

const getThemeColors = (brand: OrganizationBrand | null | undefined) => {
    if (!brand || brand.colors.length === 0) return DEFAULT_THEME_COLORS;
    // Accent/brand colors first, then the rest
    const prioritized = [...brand.colors].sort((a, b) => {
        const rank = (type: string) =>
            type === 'accent' || type === 'brand' ? 0 : 1;
        return rank(a.type) - rank(b.type);
    });
    const uniqueHexes = [...new Set(prioritized.map((color) => color.hex))];
    return uniqueHexes.slice(0, 6);
};

const BarChart: FC<{ color: string }> = ({ color }) => (
    <svg viewBox="0 0 260 110" width="100%" height="110">
        {[
            { x: 0, height: 38, opacity: 0.25 },
            { x: 52, height: 56, opacity: 0.45 },
            { x: 104, height: 50, opacity: 0.4 },
            { x: 156, height: 78, opacity: 0.75 },
            { x: 208, height: 104, opacity: 1 },
        ].map((bar) => (
            <rect
                key={bar.x}
                x={bar.x}
                y={110 - bar.height}
                width={42}
                height={bar.height}
                rx={5}
                fill={color}
                opacity={bar.opacity}
            />
        ))}
    </svg>
);

const LineChart: FC<{ color: string }> = ({ color }) => {
    const points =
        '0,78 35,66 70,71 105,55 135,60 170,45 205,28 235,37 260,26';
    return (
        <svg viewBox="0 0 260 100" width="100%" height="100">
            <defs>
                <linearGradient
                    id="brand-prototype-area"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                >
                    <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
            </defs>
            <polygon
                points={`${points} 260,100 0,100`}
                fill="url(#brand-prototype-area)"
            />
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
};

const DonutChart: FC<{ color: string; percentage: number }> = ({
    color,
    percentage,
}) => {
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    return (
        <svg viewBox="0 0 88 88" width={88} height={88}>
            <circle
                cx={44}
                cy={44}
                r={radius}
                fill="none"
                stroke="var(--mantine-color-ldGray-2)"
                strokeWidth={14}
            />
            <circle
                cx={44}
                cy={44}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={14}
                strokeLinecap="round"
                strokeDasharray={`${
                    (percentage / 100) * circumference
                } ${circumference}`}
                transform="rotate(-90 44 44)"
            />
        </svg>
    );
};

const LogoBadge: FC<{ logoUrl: string | null; name: string; color: string }> =
    ({ logoUrl, name, color }) => (
        <Box
            className={classes.logoBadge}
            bg={logoUrl ? '#ffffff' : color}
            bd={logoUrl ? '1px solid var(--mantine-color-ldGray-2)' : undefined}
        >
            {logoUrl ? (
                <img
                    src={logoUrl}
                    alt={name}
                    className={classes.logoBadgeImage}
                />
            ) : (
                (name[0] ?? 'A').toUpperCase()
            )}
        </Box>
    );

const BrandPrototype: FC = () => {
    const { data: organization } = useOrganization();
    const { data: brand, isInitialLoading: isLoadingBrand } =
        useOrganizationBrand();
    const brandUpdateMutation = useOrganizationBrandUpdateMutation();

    const [orgNameInput, setOrgNameInput] = useState<string | null>(null);
    const [domainInput, setDomainInput] = useState('');
    const [selectedColor, setSelectedColor] = useState<string | null>(null);

    const orgName = orgNameInput ?? organization?.name ?? '';
    const themeColors = getThemeColors(brand);
    const themeColor = themeColors.includes(selectedColor ?? '')
        ? selectedColor!
        : themeColors[0];
    const logoUrl = pickLogoUrl(brand);
    const brandDisplayName = brand?.name ?? orgName ?? 'Acme';

    const handleFetchBrand = (event: FormEvent) => {
        event.preventDefault();
        if (domainInput.trim().length === 0) return;
        setSelectedColor(null);
        brandUpdateMutation.mutate({ domain: domainInput });
    };

    if (isLoadingBrand) {
        return (
            <Center h="100vh">
                <Loader />
            </Center>
        );
    }

    return (
        <Box className={classes.root}>
            <Box className={classes.leftPanel}>
                <Stack gap="lg">
                    <Stack gap="xs">
                        <Title order={2}>Name your organization</Title>
                        <Text c="ldGray.7">
                            This is how your team and your agent will refer to
                            your workspace.
                        </Text>
                    </Stack>

                    <TextInput
                        label="Organization name"
                        size="md"
                        value={orgName}
                        onChange={(event) =>
                            setOrgNameInput(event.currentTarget.value)
                        }
                    />

                    <Divider />

                    <Stack gap="sm">
                        <Group gap="sm">
                            <Text fw={600}>Brand</Text>
                            <Badge variant="light" color="ldGray">
                                Optional · you can change this later
                            </Badge>
                        </Group>

                        <form onSubmit={handleFetchBrand}>
                            <Group gap="sm" align="flex-end">
                                <TextInput
                                    label="Company website"
                                    placeholder="acme.com"
                                    size="md"
                                    flex={1}
                                    value={domainInput}
                                    onChange={(event) =>
                                        setDomainInput(
                                            event.currentTarget.value,
                                        )
                                    }
                                />
                                <Button
                                    type="submit"
                                    size="md"
                                    variant="default"
                                    loading={brandUpdateMutation.isLoading}
                                    disabled={domainInput.trim().length === 0}
                                >
                                    Fetch brand
                                </Button>
                            </Group>
                        </form>

                        <Group gap="lg" align="center">
                            <Box className={classes.logoTile}>
                                {logoUrl ? (
                                    <img
                                        src={logoUrl}
                                        alt={brandDisplayName}
                                        className={classes.logoTileImage}
                                    />
                                ) : (
                                    <Box
                                        className={classes.logoBadge}
                                        bg={themeColor}
                                    >
                                        {(
                                            brandDisplayName[0] ?? 'A'
                                        ).toUpperCase()}
                                    </Box>
                                )}
                            </Box>
                            <Stack gap="xs">
                                <Text fw={600} size="sm">
                                    Theme color
                                </Text>
                                <Group gap="sm">
                                    {themeColors.map((color) => (
                                        <ColorSwatch
                                            key={color}
                                            component="button"
                                            type="button"
                                            aria-label={`Select ${color}`}
                                            color={color}
                                            size={26}
                                            className={`${classes.swatch} ${
                                                color === themeColor
                                                    ? classes.swatchSelected
                                                    : ''
                                            }`}
                                            onClick={() =>
                                                setSelectedColor(color)
                                            }
                                        />
                                    ))}
                                </Group>
                            </Stack>
                        </Group>
                    </Stack>

                    <Button size="md" w="fit-content" px="xl" mt="md">
                        Continue
                    </Button>
                </Stack>
            </Box>

            <Box className={classes.rightPanel}>
                <Stack gap="xl" align="center">
                    {brand ? (
                        <Box className={classes.detectedPill}>
                            <LogoBadge
                                logoUrl={logoUrl}
                                name={brandDisplayName}
                                color={themeColor}
                            />
                            <ColorSwatch
                                color="var(--mantine-color-green-6)"
                                size={8}
                            />
                            <Text size="sm">
                                Theme detected from <b>{brand.domain}</b>
                            </Text>
                        </Box>
                    ) : (
                        <Text c="ldGray.6" size="sm">
                            Enter your company website to detect your brand
                        </Text>
                    )}

                    <Box className={classes.chartGrid}>
                        <Paper p="lg" className={classes.chartCard}>
                            <Text c="ldGray.6" size="sm" fw={500}>
                                Weekly active users
                            </Text>
                            <BarChart color={themeColor} />
                        </Paper>
                        <Paper p="lg" className={classes.chartCard}>
                            <Stack gap={4} justify="center" flex={1}>
                                <Text c="ldGray.6" size="sm" fw={500}>
                                    Revenue
                                </Text>
                                <Text fz={40} fw={600} lh={1.1}>
                                    $248k
                                </Text>
                                <Text fw={600} size="sm" c={themeColor}>
                                    ↑ 12.4% MoM
                                </Text>
                            </Stack>
                        </Paper>
                        <Paper p="lg" className={classes.chartCard}>
                            <Text c="ldGray.6" size="sm" fw={500}>
                                Signups
                            </Text>
                            <LineChart color={themeColor} />
                        </Paper>
                        <Paper p="lg" className={classes.chartCard}>
                            <Group gap="xl" justify="center" flex={1}>
                                <DonutChart
                                    color={themeColor}
                                    percentage={64}
                                />
                                <Stack gap={4}>
                                    <Text c="ldGray.6" size="sm" fw={500}>
                                        Conversion
                                    </Text>
                                    <Text fz={32} fw={600} lh={1.1}>
                                        64%
                                    </Text>
                                </Stack>
                            </Group>
                        </Paper>
                    </Box>

                    <Text c="ldGray.6" size="sm">
                        Example charts — themed to your brand and saved to your
                        workspace.
                    </Text>
                </Stack>
            </Box>
        </Box>
    );
};

export default BrandPrototype;
