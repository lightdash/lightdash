import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const DESCRIPTION =
    'Edit a dashboard or chart by applying a patch to its JSON, then validate before persisting.';

const inputSchema = createToolSchema()
    .extend({
        slug: z
            .string()
            .min(1)
            .describe('Slug of the dashboard or chart to edit.'),
        type: z
            .enum(['dashboard', 'chart'])
            .describe('Type of Lightdash content to edit.'),
        patch: z
            .unknown()
            .describe(
                'RFC6902 Patch to apply to the current dashboard or chart JSON.',
            ),
    })
    .build();

const outputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const editContentTool = defineTool({
    name: 'editContent',
    title: 'Edit Content',
    description: DESCRIPTION,
    availability: 'agent',
    inputSchema,
    agent: { outputSchema },
});
