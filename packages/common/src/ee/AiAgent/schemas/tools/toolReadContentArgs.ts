import { z } from 'zod';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const toolReadContentArgsSchema = z
    .object({
        slug: z
            .string()
            .min(1)
            .describe('Slug of the dashboard or chart to read.'),
        type: z
            .enum(['dashboard', 'chart'])
            .describe('Type of Lightdash content to read.'),
    })
    .describe(
        'Read a dashboard or chart as JSON using its slug. Call this before editing.',
    );

const toolReadContentOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

export const readContentTool = defineTool({
    canonicalName: 'readContent',
    title: 'Read Content',
    contexts: ['agent'] as const,
    buildInputSchemas: {
        agent: () => toolReadContentArgsSchema,
    },
    outputSchema: toolReadContentOutputSchema,
});

export type ToolReadContentArgs = ToolInput<typeof readContentTool, 'agent'>;
export type ToolReadContentOutput = ToolOutput<typeof readContentTool>;
