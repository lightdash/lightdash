import { SemanticLayerType } from '@lightdash/common';
import { z } from 'zod';

export const cubeSemanticLayerFormSchema = z.object({
    type: z.literal(SemanticLayerType.CUBE),
    token: z.string(),
    domain: z
        .string()
        .url({ message: 'Domain must be a valid URL' })
        .min(1, 'Domain is required'),
});

export const dbtSemanticLayerFormSchema = z.object({
    type: z.literal(SemanticLayerType.DBT),
    token: z.string(),
    domain: z
        .string()
        .url({ message: 'Domain must be a valid URL' })
        .min(1, 'Domain is required'),
    environmentId: z.string().min(1, 'Environment ID is required'),
});
