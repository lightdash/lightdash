import { z } from 'zod';

export const toolGetProjectInfoArgsSchema = z
    .object({})
    .describe(
        [
            'Get details about the Lightdash project you are currently working in and its underlying dbt project.',
            'Use this when the user asks what dbt project this is, which git repository/branch it connects to, what dbt version or warehouse it uses, or wants general context about the current project.',
            'This is read-only, applies to the project you are currently working in, and never returns credentials or secrets.',
        ].join(' '),
    );

export const toolGetProjectInfoOutputSchema = z.object({
    result: z.string(),
    metadata: z.object({
        status: z.enum(['success', 'error']),
    }),
});

export type ToolGetProjectInfoOutput = z.infer<
    typeof toolGetProjectInfoOutputSchema
>;
