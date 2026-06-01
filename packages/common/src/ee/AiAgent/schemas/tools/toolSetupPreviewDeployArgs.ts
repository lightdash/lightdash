import { z } from 'zod';

export const TOOL_SETUP_PREVIEW_DEPLOY_DESCRIPTION = [
    'Open a pull request that sets up Lightdash preview-project deploys for this project via GitHub Actions.',
    'Use this ONLY after the user has agreed to set it up — typically in response to the offer surfaced by proposeWriteback when the repo has no preview-deploy workflow.',
    'It adds the canonical Lightdash preview workflow (a temporary preview project per pull request, torn down when the PR closes) on its own pull request.',
    'The target repository and dbt sub-folder are resolved server-side; this tool takes no arguments. The run is synchronous and can take a few minutes.',
].join(' ');

export const toolSetupPreviewDeployArgsSchema = z.object({});

export const toolSetupPreviewDeployOutputSchema = z.object({
    result: z.string(),
    metadata: z.discriminatedUnion('status', [
        z.object({
            status: z.literal('success'),
            prUrl: z.string().nullable(),
        }),
        z.object({
            status: z.literal('error'),
        }),
    ]),
});

export type ToolSetupPreviewDeployArgs = z.infer<
    typeof toolSetupPreviewDeployArgsSchema
>;

export type ToolSetupPreviewDeployOutput = z.infer<
    typeof toolSetupPreviewDeployOutputSchema
>;

type ToolSetupPreviewDeployResultLike = {
    toolType: string;
    toolName: string;
    metadata:
        | ToolSetupPreviewDeployOutput['metadata']
        | Record<string, unknown>
        | null;
};

type ToolSetupPreviewDeployResult = ToolSetupPreviewDeployResultLike & {
    toolType: 'built-in';
    toolName: 'setupPreviewDeploy';
    metadata: ToolSetupPreviewDeployOutput['metadata'];
};

export const isToolSetupPreviewDeployResult = <
    T extends ToolSetupPreviewDeployResultLike,
>(
    result: T,
): result is T & ToolSetupPreviewDeployResult =>
    result.toolType === 'built-in' &&
    result.toolName === 'setupPreviewDeploy' &&
    toolSetupPreviewDeployOutputSchema.shape.metadata.safeParse(result.metadata)
        .success;
