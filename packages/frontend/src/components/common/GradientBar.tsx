import { Box } from '@mantine-8/core';
import { useMemo, type FC } from 'react';
import { interpolateMultiColor } from '../../utils/colorUtils';

type GradientBarProps = {
    colors: string[];
    height?: number;
    borderRadius?: number;
    opacity?: number;
};

/** Number of samples to take for smooth CSS gradient */
const GRADIENT_SAMPLES = 20;

const GradientBar: FC<GradientBarProps> = ({
    colors,
    height = 4,
    borderRadius = 2,
    opacity,
}) => {
    const gradientStops = useMemo(() => {
        if (colors.length === 0) return '';
        if (colors.length === 1) return colors[0];

        // Generate sampled color stops for smooth gradient
        const stops: string[] = [];
        for (let i = 0; i <= GRADIENT_SAMPLES; i++) {
            const t = i / GRADIENT_SAMPLES;
            const color = interpolateMultiColor(colors, t);
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
