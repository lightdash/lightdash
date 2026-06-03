import { z } from 'zod';

export const baseOutputMetadataSchema = z.object({
    status: z.enum(['success', 'error']),
});

export type BaseOutputMetadata = z.infer<typeof baseOutputMetadataSchema>;
