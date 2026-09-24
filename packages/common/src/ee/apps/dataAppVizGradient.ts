import { z } from 'zod';
import { isHexCodeColor } from '../../utils/colors';
import {
    type DataAppVizGradient,
    type DataAppVizGradientValue,
} from './dataAppVizConfigOptions';

export const MIN_DATA_APP_VIZ_GRADIENT_COLORS = 2;
export const MAX_DATA_APP_VIZ_GRADIENT_COLORS = 5;

const gradientBound = z
    .union([z.number(), z.literal('auto')])
    .describe(
        "A fixed number, or 'auto' to use the smallest (min) or largest (max) value the gradient covers.",
    );

export const dataAppVizGradientValueSchema = z
    .object({
        colors: z
            .array(z.string().refine(isHexCodeColor, 'expected a hex colour'))
            .min(MIN_DATA_APP_VIZ_GRADIENT_COLORS)
            .max(MAX_DATA_APP_VIZ_GRADIENT_COLORS)
            .describe(
                'Two to five hex colours from low to high, evenly spaced along the gradient.',
            ),
        min: gradientBound,
        max: gradientBound,
    })
    .refine(({ min, max }) => min === 'auto' || max === 'auto' || min <= max, {
        message: 'min must not be above max',
        path: ['min'],
    });

export const isDataAppVizGradientValue = (
    value: unknown,
): value is DataAppVizGradientValue =>
    dataAppVizGradientValueSchema.safeParse(value).success;

/** 'auto' bounds become the given domain, or null when there is none. */
export const toDataAppVizGradient = (
    value: DataAppVizGradientValue,
    domain: { min: number; max: number } | null,
): DataAppVizGradient => ({
    colors: value.colors,
    min: value.min === 'auto' ? (domain?.min ?? null) : value.min,
    max: value.max === 'auto' ? (domain?.max ?? null) : value.max,
});
