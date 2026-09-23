import { z } from 'zod';
import { baseOutputMetadataSchema } from '../outputMetadata';

export const TOOL_LOAD_SKILL_DESCRIPTION =
    'Load a skill by name, or one of its resources. Always load the skill itself first, then resources on demand. When the skill takes arguments, pass what the user asked for in `arguments` so its placeholders are filled.';

export const toolLoadSkillArgsSchema = z.object({
    name: z.string().min(1).describe('Exact name of the skill to load.'),
    arguments: z
        .string()
        .nullish()
        .describe(
            "What the user asked for, in their words, e.g. the period or region. Fills the skill's $ARGUMENTS placeholder.",
        ),
    resourceName: z
        .string()
        .min(1)
        .nullish()
        .describe(
            'Optional sub-resource file name to load from the skill. You can find names of sub-resources by first loading the skill without this parameter.',
        ),
});

/** Which skill and version the model was served; a thread reviewer reads this. */
export const servedSkillMetadataSchema = z.object({
    name: z.string(),
    builtIn: z.boolean(),
    uuid: z.string().nullable(),
    versionNumber: z.number().nullable(),
    contentHash: z.string().nullable(),
});

export type ServedSkillMetadata = z.infer<typeof servedSkillMetadataSchema>;

export const toolLoadSkillOutputSchema = z.object({
    result: z.string(),
    metadata: baseOutputMetadataSchema.extend({
        skill: servedSkillMetadataSchema.optional(),
    }),
});

export type ToolLoadSkillArgs = z.infer<typeof toolLoadSkillArgsSchema>;
export type ToolLoadSkillOutput = z.infer<typeof toolLoadSkillOutputSchema>;
