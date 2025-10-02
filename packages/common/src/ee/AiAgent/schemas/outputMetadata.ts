import { z } from 'zod';

export const baseOutputMetadataSchema = z.object({
    status: z.enum(['success', 'error']),
});
