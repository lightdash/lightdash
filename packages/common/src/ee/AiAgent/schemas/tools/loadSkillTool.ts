import { z } from 'zod';
import { defineTool } from '../defineTool';
import { baseOutputMetadataSchema } from '../outputMetadata';
import { createToolSchema } from '../toolSchemaBuilder';

const DESCRIPTION =
    "Load a built-in skill by name, One of it's sub-resources. Always start by loading the skill itself and then load resources on demand";

const inputSchema = createToolSchema()
    .extend({
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
    .build();

const outputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export const loadSkillTool = defineTool({
    name: 'loadSkill',
    title: 'Load Skill',
    description: DESCRIPTION,
    availability: 'agent',
    inputSchema,
    agent: { outputSchema },
});
