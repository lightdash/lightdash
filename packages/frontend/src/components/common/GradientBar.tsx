import { Box } from '@mantine-8/core';
import { scaleLinear } from 'd3-scale';
import { useMemo, type FC } from 'react';

type GradientBarProps = {
    colors: string[];
    height?: number;
    borderRadius?: number;
    opacity?: number;
};

/** Number of samples to take from D3 interpolation for smooth CSS gradient */
const GRADIENT_SAMPLES = 20;

const GradientBar: FC<GradientBarProps> = ({
    colors,
    height = 4,
    borderRadius = 2,
    opacity,
}) => {
    // Use D3's scaleLinear for accurate color interpolation matching the map
    const gradientStops = useMemo(() => {
        if (colors.length === 0) return '';
        if (colors.length === 1) return colors[0];

        // Create D3 color scale with piecewise interpolation
        const domain = colors.map(
            (_, i) => i / (colors.length - 1), // 0 to 1
        );
        const colorScale = scaleLinear<string>()
            .domain(domain)
            .range(colors)
            .clamp(true);

        // Generate sampled color stops for smooth gradient
        const stops: string[] = [];
        for (let i = 0; i <= GRADIENT_SAMPLES; i++) {
            const t = i / GRADIENT_SAMPLES;
            const color = colorScale(t);
            const percent = t * 100;
            stops.push(`${color} ${percent}%`);
        }

        return stops.join(', ');
    }, [colors]);

    if (colors.length === 0) return null;

    return (
        <Box
            h={height}
            w="100%"
            style={{
                background: `linear-gradient(to right, ${gradientStops})`,
                borderRadius,
                ...(opacity !== undefined && { opacity }),
                boxShadow: 'var(--mantine-shadow-subtle)',
            }}
        />
    );
};

export default GradientBar;
