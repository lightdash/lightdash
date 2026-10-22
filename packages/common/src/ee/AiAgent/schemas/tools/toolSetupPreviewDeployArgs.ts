import { z } from 'zod';
import { toolErrorStructuredContentSchema } from '../outputMetadata';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';

export const TOOL_SETUP_PREVIEW_DEPLOY_DESCRIPTION = [
    "Open a pull request that adds the Lightdash preview-deploy GitHub Actions workflow to this project's repository: each pull request then gets a temporary preview project, torn down when it closes.",
    'Call it when the user asks to set up preview deploys ("deploy a preview project for each PR") or accepts your offer after getProjectInfo reports no preview-deploy workflow; no earlier writeback is needed.',
    'It automates GitHub Actions only; on other CI, tell the user preview deploys are set up by hand.',
    'It takes no arguments (the repository and dbt sub-folder are resolved server-side) and can take a few minutes.',
].join(' ');

export const toolSetupPreviewDeployArgsSchema = z.object({});

const toolSetupPreviewDeployMetadataSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('success'),
        prUrl: z.string().nullable(),
    }),
    z.object({
        status: z.literal('error'),
    }),
]);

export const toolSetupPreviewDeployStructuredContentSchema = z.object({
    projectName: z
        .string()
        .describe('Lightdash project the preview deploys are based on.'),
    repository: z
        .string()
        .describe(
            'GitHub repository (owner/name) the pull request was opened against.',
        ),
    secrets: z
        .array(
            z.object({
                name: z.string().describe('GitHub Actions secret name.'),
                value: z
                    .string()
                    .nullable()
                    .describe(
                        'Pre-filled value to present to the user verbatim; null when the user must provide it themselves.',
                    ),
                description: z
                    .string()
                    .describe('What the secret is used for.'),
            }),
        )
        .describe(
            'GitHub Actions secrets the user must add to the repository before the workflow can run.',
        ),
});

// Hand-rolled rather than `structuredToolOutputSchema`: that helper takes an
// object metadata schema and this tool's metadata is a discriminated union.
export const toolSetupPreviewDeployOutputSchema = z.object({
    result: z.string(),
    metadata: toolSetupPreviewDeployMetadataSchema,
    structuredContent: z.union([
        toolSetupPreviewDeployStructuredContentSchema,
        toolErrorStructuredContentSchema,
    ]),
});

export type ToolSetupPreviewDeployArgs = z.infer<
    typeof toolSetupPreviewDeployArgsSchema
>;

export type ToolSetupPreviewDeployStructuredContent = z.infer<
    typeof toolSetupPreviewDeployStructuredContentSchema
>;

export type ToolSetupPreviewDeployOutput = z.infer<
    typeof toolSetupPreviewDeployOutputSchema
>;

export const isToolSetupPreviewDeployResult = makeBuiltInToolResultGuard(
    'setupPreviewDeploy',
    toolSetupPreviewDeployOutputSchema.shape.metadata,
);
