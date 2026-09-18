import { z } from 'zod';
import {
    baseOutputMetadataSchema,
    structuredToolOutputSchema,
} from '../outputMetadata';

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
        .nullish()
        .describe(
            'Optional sub-resource file name to load from the skill. You can find names of sub-resources by first loading the skill without this parameter.',
        ),
});

const toolLoadSkillResourceReferenceSchema = z.object({
    name: z
        .string()
        .describe('Resource name to pass as `resourceName` to load it.'),
    description: z.string(),
});

export const toolLoadSkillStructuredContentSchema = z.discriminatedUnion(
    'kind',
    [
        z.object({
            kind: z.literal('skill'),
            skill: z.string().describe('Name of the loaded skill.'),
            body: z.string().describe('The skill instructions.'),
            resources: z
                .array(toolLoadSkillResourceReferenceSchema)
                .describe(
                    'Sub-resources the skill offers; empty when it has none.',
                ),
        }),
        z.object({
            kind: z.literal('resource'),
            skill: z
                .string()
                .describe('Name of the skill the resource belongs to.'),
            resource: z.object({
                name: z.string(),
                content: z.string().describe('The resource file contents.'),
            }),
        }),
    ],
);

export const toolLoadSkillOutputSchema = structuredToolOutputSchema({
    metadata: baseOutputMetadataSchema,
    structuredContent: toolLoadSkillStructuredContentSchema,
});

export type ToolLoadSkillArgs = z.infer<typeof toolLoadSkillArgsSchema>;
export type ToolLoadSkillStructuredContent = z.infer<
    typeof toolLoadSkillStructuredContentSchema
>;
export type ToolLoadSkillOutput = z.infer<typeof toolLoadSkillOutputSchema>;
