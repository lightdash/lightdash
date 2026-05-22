import { z } from 'zod';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const toolEditContentArgsSchema = z
    .object({
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
    .describe(
        'Edit a dashboard or chart by applying a patch to its JSON, then validate before persisting.',
    );

const toolEditContentOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

export const editContentTool = defineTool({
    canonicalName: 'editContent',
    title: 'Edit Content',
    contexts: ['agent'] as const,
    buildInputSchemas: {
        agent: () => toolEditContentArgsSchema,
    },
    outputSchema: toolEditContentOutputSchema,
});

export type ToolEditContentArgs = ToolInput<typeof editContentTool, 'agent'>;
export type ToolEditContentOutput = ToolOutput<typeof editContentTool>;
