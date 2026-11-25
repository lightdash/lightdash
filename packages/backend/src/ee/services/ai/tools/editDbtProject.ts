import {
    editDbtProjectToolDefinition,
    writeToolDefinition,
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
};

type EditDbtProjectMetadata = ToolEditDbtProjectOutput['metadata'];

type PendingResult = ExecuteStructuredToolResult<
    ToolEditDbtProjectStructuredContent,
    Extract<EditDbtProjectMetadata, { status: 'pending' }>
>;

type ErrorResult = ExecuteToolErrorResult<
    Extract<EditDbtProjectMetadata, { status: 'error' }>
>;

const failure = (message: string): ErrorResult => ({
    ...toolFailure(message),
    metadata: { status: 'error', errorCode: 'unknown' },
});

const startChange = async (
    editDbtProject: EditDbtProjectFn,
    args: Parameters<EditDbtProjectFn>[0],
    describe: (started: { inSandbox: boolean }) => string,
    retryWith: string,
): Promise<PendingResult | ErrorResult> => {
    try {
        const started = await editDbtProject(args);
        if (started.status === 'script_failed') {
            return failure(
                `The script did not run, so nothing was saved: ${started.error}${started.logs.length > 0 ? `\nconsole.log:\n${started.logs.join('\n')}` : ''}\nFix the script and call ${retryWith} again.`,
            );
        }
        const { aiWritebackRunUuid, diffs } = started;
        return {
            result: describe(started),
            metadata: { status: 'pending', aiWritebackRunUuid, diffs },
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
};

export const getEditDbtProject = ({ editDbtProject }: Dependencies) =>
    tool({
        ...editDbtProjectToolDefinition.for('agent'),
        execute: async (
            { prompt, prUrl, startNewPullRequest, requestedBy },
            { toolCallId },
        ) => {
            if (requestedBy === 'agent_initiated') {
                return failure(
                    'No pull request was opened: the user did not ask for a repository change. Make what they asked for now with the tools that edit content inside this project, offer the repository change in one sentence, and call editDbtProject with requestedBy offer_accepted once they say yes.',
                );
            }
            return startChange(
                editDbtProject,
                {
                    prompt,
                    prUrl,
                    startNewPullRequest,
                    progressId: toolCallId,
                    script: null,
                },
                () =>
                    'Started the change; the pull request opens in the background. Acknowledge it briefly. Until it opens, listWorkstreams shows it as a change still being opened.',
                'editDbtProject',
            );
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });

/** Semantic Studio's save: always on this conversation's draft. */
export const getWrite = ({ editDbtProject }: Dependencies) =>
    tool({
        ...writeToolDefinition.for('agent'),
        execute: async ({ prompt, script, moreToDo }, { toolCallId }) =>
            startChange(
                editDbtProject,
                {
                    prompt,
                    prUrl: null,
                    startNewPullRequest: null,
                    progressId: toolCallId,
                    script,
                },
                ({ inSandbox }) =>
                    `${
                        inSandbox
                            ? 'Started the change. It needs dbt to run, so it is saved in a sandbox and takes a few minutes; the pull request opens in the background. Tell the person it will take a few minutes, briefly.'
                            : `Started saving the change to the draft. Its card shows the person the files, your note, your options and when it is saved, so ${moreToDo ? 'go on with the rest of what they asked without describing it' : 'write nothing more'}.`
                    } Until it is saved, pr.list in read shows it as a change still being saved.`,
                'write',
            ),
        toModelOutput: ({ output }) => toModelOutput(output),
    });
