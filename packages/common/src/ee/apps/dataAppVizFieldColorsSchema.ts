import { z } from 'zod';
import { isHexCodeColor } from '../../utils/colors';

export const dataAppVizColorGradientSchema = z.object({
    enabled: z.boolean(),
    start: z.string().refine(isHexCodeColor, 'invalid hex color'),
    end: z.string().refine(isHexCodeColor, 'invalid hex color'),
    min: z.union([z.number().finite(), z.literal('auto')]),
    max: z.union([z.number().finite(), z.literal('auto')]),
});

const ruleBase = {
    enabled: z.boolean(),
    color: z.string().refine(isHexCodeColor, 'invalid hex color'),
};

export const dataAppVizColorRuleSchema = z.discriminatedUnion('operator', [
    z.object({
        ...ruleBase,
        operator: z.enum(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']),
        value: z.number().finite(),
    }),
    z.object({
        ...ruleBase,
        operator: z.enum(['between', 'notBetween']),
        min: z.number().finite(),
        max: z.number().finite(),
    }),
]);

export const dataAppVizFieldColorValuesSchema = z.record(
    z.string(),
    z.record(
        z.string().min(1),
        z.object({
            gradient: dataAppVizColorGradientSchema.optional(),
            rules: z.array(dataAppVizColorRuleSchema).optional(),
        }),
    ),
);
