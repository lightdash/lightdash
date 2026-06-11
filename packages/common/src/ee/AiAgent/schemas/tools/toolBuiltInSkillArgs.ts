import { z } from 'zod';

export const TOOL_LIST_SKILLS_DESCRIPTION =
    'List Lightdash built-in skills available to this MCP server. Use this when the client does not expose MCP resources directly.';

export const TOOL_LOAD_SKILL_DESCRIPTION_MCP =
    'Read the main SKILL.md instructions for a Lightdash built-in skill. Call list_skills first to discover available skill names.';

export const TOOL_LOAD_SKILL_RESOURCE_DESCRIPTION =
    'Read a supporting resource file for a Lightdash built-in skill. Use the resource path returned by list_skills.';

export const toolListSkillsArgsSchema = z.object({});

export const toolLoadSkillMcpArgsSchema = z.object({
    name: z
        .string()
        .describe(
            'Skill name from list_skills, for example developing-in-lightdash',
        ),
});

export const toolLoadSkillResourceArgsSchema = z.object({
    name: z
        .string()
        .describe(
            'Skill name from list_skills, for example developing-in-lightdash',
        ),
    path: z
        .string()
        .describe(
            'Resource path from list_skills, for example resources/dashboard-reference.md',
        ),
});

export const skillToolResourceSchema = z.object({
    path: z.string(),
    uri: z.string(),
    name: z.string(),
    title: z.string(),
    description: z.string(),
    mimeType: z.string(),
    size: z.number(),
    digest: z.string(),
});

export const skillToolReferenceSchema = z.object({
    name: z.string(),
    uri: z.string(),
    title: z.string(),
    description: z.string(),
    mimeType: z.string(),
    size: z.number(),
    digest: z.string(),
    resources: z.array(skillToolResourceSchema),
});

export const toolListSkillsOutputSchema = z.object({
    skills: z.array(skillToolReferenceSchema),
});

export const toolLoadSkillOutputSchemaMcp = z.object({
    skill: skillToolReferenceSchema,
    body: z.string(),
});

export const toolLoadSkillResourceOutputSchema = z.object({
    skill: skillToolReferenceSchema,
    resource: skillToolResourceSchema,
    body: z.string(),
});

export type ToolListSkillsArgs = z.infer<typeof toolListSkillsArgsSchema>;
export type ToolLoadSkillMcpArgs = z.infer<typeof toolLoadSkillMcpArgsSchema>;
export type ToolLoadSkillResourceArgs = z.infer<
    typeof toolLoadSkillResourceArgsSchema
>;
