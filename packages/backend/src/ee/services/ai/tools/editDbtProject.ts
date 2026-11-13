import {
    createAgentInputSchema,
    editDbtProjectToolDefinition,
    toolEditDbtProjectCodeModeArgsSchema,
    type ToolEditDbtProjectOutput,
    type ToolEditDbtProjectStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { EditDbtProjectFn } from '../types/aiAgentDependencies';
import {
    toolFailure,
    type ExecuteStructuredToolResult,
    type ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    editDbtProject: EditDbtProjectFn;
    /** Semantic Studio with code mode on: the change can come as a script. */
    acceptsScript: boolean;
};

type EditDbtProjectMetadata = ToolEditDbtProjectOutput['metadata'];

type PendingResult = ExecuteStructuredToolResult<
    ToolEditDbtProjectStructuredContent,
    Extract<EditDbtProjectMetadata, { status: 'pending' }>
>;

type ErrorResult = ExecuteToolErrorResult<
    Extract<EditDbtProjectMetadata, { status: 'error' }>
>;

const toolDefinition = editDbtProjectToolDefinition.for('agent');

export const getEditDbtProject = ({
    editDbtProject,
    acceptsScript,
}: Dependencies) =>
    tool({
        ...toolDefinition,
        ...(acceptsScript
            ? {
                  inputSchema: createAgentInputSchema(
                      toolEditDbtProjectCodeModeArgsSchema,
                  ),
              }
            : {}),
        execute: async (
            args,
            { toolCallId },
        ): Promise<PendingResult | ErrorResult> => {
            const { prompt, prUrl: pastedPrUrl, startNewPullRequest } = args;
            const script =
                acceptsScript &&
                'script' in args &&
                typeof args.script === 'string'
                    ? args.script
                    : null;
            try {
                const started = await editDbtProject({
                    prompt,
                    prUrl: pastedPrUrl,
                    startNewPullRequest,
                    progressId: toolCallId,
                    script,
                });
                if (started.status === 'script_failed') {
                    const failure = toolFailure(
                        `The script did not run, so nothing was saved: ${started.error}${started.logs.length > 0 ? `\nconsole.log:\n${started.logs.join('\n')}` : ''}\nFix the script and call editDbtProject again.`,
                    );
                    return {
                        ...failure,
                        metadata: { status: 'error', errorCode: 'unknown' },
                    };
                }
                const { aiWritebackRunUuid } = started;

                return {
                    result: 'Started the change; the pull request opens in the background. Acknowledge it briefly.',
                    metadata: {
                        status: 'pending',
                        aiWritebackRunUuid,
                    },
                    structuredContent: { status: 'pending' },
                };
            } catch (error) {
                const errorOutput = toolErrorOutput(
                    error,
                    'Error starting AI writeback. No pull request was opened.',
                );
                return {
                    ...errorOutput,
                    metadata: { ...errorOutput.metadata, errorCode: 'unknown' },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
