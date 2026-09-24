import { z } from 'zod';
import { isHexCodeColor } from '../../utils/colors';

export const dataAppVizColorGradientSchema = z.object({
    enabled: z.boolean(),
    start: z.string().refine(isHexCodeColor, 'invalid hex color'),
    end: z.string().refine(isHexCodeColor, 'invalid hex color'),
    min: z.union([z.number().finite(), z.literal('auto')]),
    max: z.union([z.number().finite(), z.literal('auto')]),
});

export const dataAppVizFieldColorValuesSchema = z.record(
    z.string(),
    z.record(
        z.string().min(1),
        z.object({ gradient: dataAppVizColorGradientSchema.optional() }),
    ),
);
