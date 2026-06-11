import { z } from 'zod';

export const TOOL_SETUP_PREVIEW_DEPLOY_DESCRIPTION = [
    'Open a pull request that sets up Lightdash preview-project deploys for this project via GitHub Actions.',
    'Call this whenever the user wants to add Lightdash preview deploys — EITHER when they accept the offer surfaced by editDbtProject, OR when they ask directly (e.g. "set up preview deploys", "add the Lightdash preview GitHub Action", "deploy a preview project for each PR"). A prior writeback or offer is NOT required.',
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
