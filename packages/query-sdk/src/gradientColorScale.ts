import Color from 'colorjs.io';
import { isVizGradientValue } from './gradient';

/** Build once per render, using the chart's chosen values for automatic bounds. */
export const createGradientColorScale = (
    gradient: unknown,
    values: readonly unknown[] = [],
): ((value: unknown) => string | undefined) => {
    if (!isVizGradientValue(gradient)) return () => undefined;
    let autoMin = Infinity;
    let autoMax = -Infinity;
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            autoMin = Math.min(autoMin, value);
            autoMax = Math.max(autoMax, value);
        }
    }
    const min = gradient.min === 'auto' ? autoMin : gradient.min;
    const max = gradient.max === 'auto' ? autoMax : gradient.max;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
        return () => undefined;
    }
    const { colors } = gradient;
    const segments = colors.slice(1).map((color, index) =>
        Color.range(new Color(colors[index]), new Color(color), {
            space: 'oklab',
        }),
    );
    return (value: unknown): string | undefined => {
        if (typeof value !== 'number' || !Number.isFinite(value))
            return undefined;
        if (min === max) return colors[Math.floor(colors.length / 2)];
        if (value <= min) return colors[0];
        if (value >= max) return colors[colors.length - 1];
        // Scaling first avoids overflow when finite bounds span +/- MAX_VALUE.
        const span = max - min;
        const t = Number.isFinite(span)
            ? (value - min) / span
            : (value / 2 - min / 2) / (max / 2 - min / 2);
        const position = t * segments.length;
        const index = Math.min(Math.floor(position), segments.length - 1);
        return segments[index](position - index)
            .to('srgb')
            .toString({ format: 'hex', collapse: false });
    };
};
