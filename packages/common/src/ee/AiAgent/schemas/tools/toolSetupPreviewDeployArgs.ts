import { z } from 'zod';
import { toolErrorStructuredContentSchema } from '../outputMetadata';
import { makeBuiltInToolResultGuard } from './builtInToolResultGuard';

export const TOOL_SETUP_PREVIEW_DEPLOY_DESCRIPTION = [
    'Open a pull request that sets up Lightdash preview-project deploys for this project via GitHub Actions.',
    'Call this whenever the user wants to add Lightdash preview deploys — EITHER when they accept the offer surfaced by editDbtProject, OR when they ask directly (e.g. "set up preview deploys", "add the Lightdash preview GitHub Action", "deploy a preview project for each PR"). A prior writeback or offer is NOT required.',
    'It adds the canonical Lightdash preview workflow (a temporary preview project per pull request, torn down when the PR closes) on its own pull request.',
    'The target repository and dbt sub-folder are resolved server-side; this tool takes no arguments. The run is synchronous and can take a few minutes.',
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
    prUrl: z
        .string()
        .describe(
            'URL of the opened pull request. The user already sees it as a "View pull request" button, so do not repeat it in the reply.',
        ),
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
