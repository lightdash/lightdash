import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_LOAD_SKILL_DESCRIPTION =
    "Load a built-in skill by name, One of it's sub-resources. Always start by loading the skill itself and then load resources on demand";

export const toolLoadSkillArgsSchema = z.object({
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
});

export const toolLoadSkillOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema,
});

export type ToolLoadSkillArgs = z.infer<typeof toolLoadSkillArgsSchema>;
export type ToolLoadSkillOutput = z.infer<typeof toolLoadSkillOutputSchema>;
