import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const DESCRIPTION =
    'Generate one or more UUIDs to use as stable identifiers when creating new objects.';

const inputSchema = createToolSchema()
    .extend({
        count: z
            .number()
            .min(1)
            .max(20)
            .describe('Number of UUIDs to generate.'),
    })
    .build();

const outputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const generateUuidsTool = defineTool({
    name: 'generateUuids',
    title: 'Generate UUIDs',
    description: DESCRIPTION,
    availability: 'agent',
    inputSchema,
    agent: { outputSchema },
});
