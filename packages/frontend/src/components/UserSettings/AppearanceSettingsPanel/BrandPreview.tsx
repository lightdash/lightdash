import {
    type OrganizationBrandColor,
    type OrganizationBrandFont,
    type OrganizationBrandLogo,
} from '@lightdash/common';
import { Box, Group, Paper, Stack, Text } from '@mantine-8/core';
import { useEffect, type FC } from 'react';
// TODO: re-enable browser chrome + nav header preview
// import { IconSearch } from '@tabler/icons-react';
// import MantineIcon from '../../common/MantineIcon';
import classes from './BrandPreview.module.css';

const DEFAULT_PRIMARY = '#5b3df5';

// Only Google-hosted fonts can be loaded on demand in the browser. Proprietary
// ('custom') brand fonts have no public web source, so we leave the family
// unset and let the preview fall back to the app font.
const isLoadableFont = (font: OrganizationBrandFont | null): boolean =>
    font?.origin === 'google';

const googleFontsHref = (families: string[]): string | null => {
    const unique = [...new Set(families)];
    if (unique.length === 0) return null;
    const params = unique
        .map(
            (family) =>
                `family=${encodeURIComponent(family).replace(
                    /%20/g,
                    '+',
                )}:wght@400;500;600;700`,
        )
        .join('&');
    return `https://fonts.googleapis.com/css2?${params}&display=swap`;
};

/** Injects a Google Fonts stylesheet for the given families while mounted. */
const useGoogleFonts = (families: string[]) => {
    const href = googleFontsHref(families);
    useEffect(() => {
        if (!href) return undefined;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
        return () => {
            document.head.removeChild(link);
        };
    }, [href]);
};

const isValidHexColor = (hex: string): boolean =>
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex);

const pickPrimaryColor = (colors: OrganizationBrandColor[]): string => {
    const valid = colors.filter((color) => isValidHexColor(color.hex));
    const byType = (type: string) =>
        valid.find((color) => color.type === type)?.hex;
    return (
        byType('accent') ?? byType('brand') ?? valid[0]?.hex ?? DEFAULT_PRIMARY
    );
};

// TODO: re-enable browser chrome + nav header preview
// const pickNavLogo = (logos: OrganizationBrandLogo[]): string | null => {
//     // The nav bar has a coloured (usually dark) background, so prefer the
//     // light/white artwork — which Brandfetch labels `theme: 'light'` — falling
//     // back to any available logo.
//     const light = logos.find((logo) => logo.theme === 'light');
//     return light?.url ?? logos[0]?.url ?? null;
// };

const BAR_VALUES = [55, 78, 48, 88, 60, 96, 72];

const PIE_VALUES = [32, 24, 18, 14, 12];

const pieSlicePaths = (
    values: number[],
    cx: number,
    cy: number,
    radius: number,
): string[] => {
    const total = values.reduce((sum, value) => sum + value, 0);
    let angle = -Math.PI / 2;
    return values.map((value) => {
        const start = angle;
        const end = start + (value / total) * Math.PI * 2;
        angle = end;
        const x0 = cx + radius * Math.cos(start);
        const y0 = cy + radius * Math.sin(start);
        const x1 = cx + radius * Math.cos(end);
        const y1 = cy + radius * Math.sin(end);
        const largeArc = end - start > Math.PI ? 1 : 0;
        return `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 ${largeArc} 1 ${x1} ${y1} Z`;
    });
};

const linePath = (points: number[]): string => {
    const width = 300;
    const height = 60;
    const max = Math.max(...points);
    return points
        .map((point, index) => {
            const x = (index / (points.length - 1)) * width;
            const y = height - (point / max) * height * 0.85 - 4;
            return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');
};

type BrandPreviewProps = {
    name: string | null;
    logos: OrganizationBrandLogo[];
    colors: OrganizationBrandColor[];
    titleFont: OrganizationBrandFont | null;
    bodyFont: OrganizationBrandFont | null;
    // Optional so existing call sites (onboarding) keep working without it
    paletteColors?: string[] | null;
};

export const BrandPreview: FC<BrandPreviewProps> = ({
    colors,
    titleFont,
    bodyFont,
    paletteColors,
}) => {
    const primary = pickPrimaryColor(colors);
    // TODO: re-enable browser chrome + nav header preview
    // const navLogo = pickNavLogo(logos);
    // const displayName = name ?? 'Your company';
    const chartColors =
        paletteColors && paletteColors.length > 0
            ? paletteColors
            : [primary, `${primary}59`];

    // Apply a brand font family only when we can actually load it, otherwise
    // fall back to the app font.
    const titleFamily = isLoadableFont(titleFont) ? titleFont!.name : undefined;
    const bodyFamily = isLoadableFont(bodyFont) ? bodyFont!.name : undefined;
    useGoogleFonts(
        [titleFamily, bodyFamily].filter((f): f is string => Boolean(f)),
    );

    return (
        <Paper withBorder radius="md" className={classes.window}>
            {/* TODO: re-enable browser chrome header preview
            <Group className={classes.chrome} gap="xs" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <Box className={classes.dotRed} />
                    <Box className={classes.dotYellow} />
                    <Box className={classes.dotGreen} />
                </Group>
                <Box className={classes.urlBar}>
                    <Text size="xs" c="dimmed">
                        {window.location.host}
                    </Text>
                </Box>
            </Group>
            */}

            {/* TODO: re-enable nav header preview (uses brand logo)
            <Box className={classes.nav} bg={primary}>
                <Group gap="sm" wrap="nowrap">
                    {navLogo ? (
                        <img
                            src={navLogo}
                            alt={displayName}
                            className={classes.navLogo}
                        />
                    ) : (
                        <Box className={classes.navLogoFallback}>
                            <Text size="xs" fw={700} c={primary}>
                                {displayName[0]?.toUpperCase() ?? 'A'}
                            </Text>
                        </Box>
                    )}
                    <Text size="sm" fw={600} c="white" ff={bodyFamily}>
                        {displayName}
                    </Text>
                </Group>
                <Group gap="lg" wrap="nowrap" visibleFrom="xs">
                    <Text size="xs" c="white" ff={bodyFamily}>
                        Dashboards
                    </Text>
                    <Text size="xs" c="white" opacity={0.85} ff={bodyFamily}>
                        Charts
                    </Text>
                    <Text size="xs" c="white" opacity={0.85} ff={bodyFamily}>
                        SQL runner
                    </Text>
                </Group>
                <Box className={classes.navAvatar}>
                    <MantineIcon icon={IconSearch} color="white" size={14} />
                </Box>
            </Box>
            */}

            <Box className={classes.body}>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={2}>
                        <Text
                            fw={700}
                            fz={22}
                            ff={titleFamily}
                            className={classes.title}
                        >
                            Revenue overview
                        </Text>
                        <Text size="xs" c="dimmed" ff={bodyFamily}>
                            Performance across every channel this quarter.
                        </Text>
                    </Stack>
                    {/* TODO: re-enable "+ New chart" button preview
                    <Box className={classes.primaryButton} bg={primary}>
                        <Text size="xs" fw={600} c="white">
                            + New chart
                        </Text>
                    </Box>
                    */}
                </Group>

                <Group gap="sm" grow align="stretch" wrap="nowrap">
                    <Paper withBorder radius="md" className={classes.card}>
                        <Text size="xs" c="dimmed" ff={bodyFamily}>
                            Total revenue
                        </Text>
                        <Text fw={700} fz={24} ff={titleFamily}>
                            $1.24M
                        </Text>
                        <Text size="xs" c="teal" ff={bodyFamily}>
                            +12.8% vs last quarter
                        </Text>
                    </Paper>
                    <Paper withBorder radius="md" className={classes.card}>
                        <Text size="xs" c="dimmed" mb={6} ff={bodyFamily}>
                            Weekly trend
                        </Text>
                        <svg viewBox="0 0 300 60" width="100%" height="52">
                            <path
                                d={linePath([20, 32, 26, 44, 38, 52, 60])}
                                fill="none"
                                stroke={primary}
                                strokeWidth={3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </Paper>
                </Group>

                <Group gap="sm" grow align="stretch" wrap="nowrap">
                    <Paper withBorder radius="md" className={classes.card}>
                        <Text size="xs" c="dimmed" mb="xs" ff={bodyFamily}>
                            Revenue by channel
                        </Text>
                        <Box className={classes.barsRow}>
                            {BAR_VALUES.map((value, index) => (
                                <Box
                                    key={`bar-${index}`}
                                    className={classes.bar}
                                    h={`${value}%`}
                                    bg={chartColors[index % chartColors.length]}
                                />
                            ))}
                        </Box>
                    </Paper>
                    <Paper withBorder radius="md" className={classes.card}>
                        <Text size="xs" c="dimmed" mb="xs" ff={bodyFamily}>
                            Revenue share
                        </Text>
                        <svg viewBox="0 0 100 100" width="100%" height={90}>
                            {pieSlicePaths(PIE_VALUES, 50, 50, 46).map(
                                (path, index) => (
                                    <path
                                        key={`slice-${index}`}
                                        d={path}
                                        fill={
                                            chartColors[
                                                index % chartColors.length
                                            ]
                                        }
                                        stroke="var(--mantine-color-body)"
                                        strokeWidth={1.5}
                                    />
                                ),
                            )}
                        </svg>
                    </Paper>
                </Group>
            </Box>
        </Paper>
    );
};
