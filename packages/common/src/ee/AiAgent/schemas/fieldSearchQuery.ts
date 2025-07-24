import { z } from 'zod';
import { fieldIdSchemaUnknown } from './fieldId';

export const fieldSearchQuerySchema = z.object({
    name: fieldIdSchemaUnknown,
    description: z.string().describe(`Description of a field to search for.`),
});

export type FieldSearchQuery = z.infer<typeof fieldSearchQuerySchema>;
