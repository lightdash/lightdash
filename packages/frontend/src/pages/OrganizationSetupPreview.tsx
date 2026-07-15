import { Box, Text } from '@mantine-8/core';
import { type FC } from 'react';
import classes from './OrganizationSetup.module.css';

const toAlphaHex = (alpha: number): string =>
    Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0');

const normalizeHex = (hex: string): string =>
    hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;

const withAlpha = (hex: string, alpha: number): string =>
    `${normalizeHex(hex)}${toAlphaHex(alpha)}`;

const BAR_HEIGHTS = [38, 54, 66, 80, 96];
const BAR_ALPHAS = [0.4, 0.55, 0.7, 0.85, 1];

const LINE_POINTS = [22, 30, 26, 42, 36, 52, 60];

const linePath = (points: number[]): string => {
    const width = 240;
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

const areaPath = (points: number[]): string =>
    `${linePath(points)} L 240 60 L 0 60 Z`;

const DONUT_RADIUS = 26;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const CONVERSION = 0.64;

type OrganizationSetupPreviewProps = {
    themeColor: string;
    detectedDomain: string | null;
    detectedLogoUrl: string | null;
};

const OrganizationSetupPreview: FC<OrganizationSetupPreviewProps> = ({
    themeColor,
    detectedDomain,
    detectedLogoUrl,
}) => (
    <Box className={classes.previewCard}>
        {detectedDomain && (
            <Box className={classes.pill}>
                {detectedLogoUrl && (
                    <img
                        src={detectedLogoUrl}
                        alt=""
                        className={classes.pillLogo}
                    />
                )}
                <Box className={classes.pillDot} />
                <Text size="xs" c="dimmed">
                    Theme detected from{' '}
                    <Text span fw={600} c="dimmed">
                        {detectedDomain}
                    </Text>
                </Text>
            </Box>
        )}

        <Box className={classes.chartGrid}>
            <Box className={classes.chartCard}>
                <Text size="xs" c="dimmed">
                    Weekly active users
                </Text>
                <Box className={classes.barsRow}>
                    {BAR_HEIGHTS.map((height, index) => (
                        <Box
                            key={height}
                            className={classes.bar}
                            h={`${height}%`}
                            bg={withAlpha(themeColor, BAR_ALPHAS[index])}
                        />
                    ))}
                </Box>
            </Box>

            <Box className={classes.chartCard}>
                <Text size="xs" c="dimmed">
                    Revenue
                </Text>
                <Text fw={700} fz={32} mt="auto">
                    $248k
                </Text>
                <Text size="sm" fw={600} c={themeColor}>
                    ↑ 12.4% MoM
                </Text>
            </Box>

            <Box className={classes.chartCard}>
                <Text size="xs" c="dimmed">
                    Signups
                </Text>
                <Box mt="auto">
                    <svg viewBox="0 0 240 60" width="100%" height="60">
                        <defs>
                            <linearGradient
                                id="signups-fill"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor={themeColor}
                                    stopOpacity={0.35}
                                />
                                <stop
                                    offset="100%"
                                    stopColor={themeColor}
                                    stopOpacity={0}
                                />
                            </linearGradient>
                        </defs>
                        <path
                            d={areaPath(LINE_POINTS)}
                            fill="url(#signups-fill)"
                        />
                        <path
                            d={linePath(LINE_POINTS)}
                            fill="none"
                            stroke={themeColor}
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </Box>
            </Box>

            <Box className={classes.chartCard}>
                <Text size="xs" c="dimmed">
                    Conversion
                </Text>
                <Box className={classes.donutWrap}>
                    <svg width="72" height="72" viewBox="0 0 72 72">
                        <circle
                            cx="36"
                            cy="36"
                            r={DONUT_RADIUS}
                            fill="none"
                            stroke={withAlpha(themeColor, 0.18)}
                            strokeWidth={8}
                        />
                        <circle
                            cx="36"
                            cy="36"
                            r={DONUT_RADIUS}
                            fill="none"
                            stroke={themeColor}
                            strokeWidth={8}
                            strokeLinecap="round"
                            strokeDasharray={`${
                                CONVERSION * DONUT_CIRCUMFERENCE
                            } ${DONUT_CIRCUMFERENCE}`}
                            transform="rotate(-90 36 36)"
                        />
                        <text
                            x="36"
                            y="40"
                            textAnchor="middle"
                            fontSize="15"
                            fontWeight={700}
                            fill="currentColor"
                        >
                            64%
                        </text>
                    </svg>
                </Box>
            </Box>
        </Box>

        <Text size="xs" c="dimmed" ta="center">
            Example charts — themed to your brand.
        </Text>
    </Box>
);

export { OrganizationSetupPreview };
