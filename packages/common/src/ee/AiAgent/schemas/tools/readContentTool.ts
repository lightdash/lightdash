import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const DESCRIPTION =
    'Read a dashboard or chart as JSON using its slug. Call this before editing.';

const inputSchema = createToolSchema()
    .extend({
        slug: z
            .string()
            .min(1)
            .describe('Slug of the dashboard or chart to read.'),
        type: z
            .enum(['dashboard', 'chart'])
            .describe('Type of Lightdash content to read.'),
    })
    .build();

const outputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const readContentTool = defineTool({
    name: 'readContent',
    title: 'Read Content',
    description: DESCRIPTION,
    availability: 'agent',
    inputSchema,
    agent: { outputSchema },
});
