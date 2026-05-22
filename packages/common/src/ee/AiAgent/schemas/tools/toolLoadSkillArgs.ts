import { z } from 'zod';
import { defineTool, type ToolInput, type ToolOutput } from './toolDefinition';

const toolLoadSkillArgsSchema = z
    .object({
        name: z
            .string()
            .min(1)
            .describe('Exact name of the built-in skill to load.'),
        resourceName: z
            .string()
            .min(1)
            .nullable()
            .describe(
                'Optional sub-resource file name to load from the skill. You can find names of sub-resources by first loading the skill without this parameter.',
            ),
    })
    .describe(
        "Load a built-in skill by name, One of it's sub-resources. Always start by loading the skill itself and then load resources on demand",
    );

const toolLoadSkillOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

export const loadSkillTool = defineTool({
    canonicalName: 'loadSkill',
    title: 'Load Skill',
    contexts: ['agent'] as const,
    buildInputSchemas: {
        agent: () => toolLoadSkillArgsSchema,
    },
    outputSchema: toolLoadSkillOutputSchema,
});

export type ToolLoadSkillArgs = ToolInput<typeof loadSkillTool, 'agent'>;
export type ToolLoadSkillOutput = ToolOutput<typeof loadSkillTool>;
