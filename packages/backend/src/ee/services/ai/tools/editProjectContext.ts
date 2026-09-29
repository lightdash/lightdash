import {
    editProjectContextToolDefinition,
    InsufficientGitPermissionsError,
    PullRequestProvider,
    type ToolEditProjectContextOutput,
    type ToolEditProjectContextStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import { WritebackGitNotConnectedError } from '../../AiWritebackService/errors';
import type { EditProjectContextFn } from '../types/aiAgentDependencies';
import { toModelOutput } from '../utils/toModelOutput';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    editProjectContext: EditProjectContextFn;
};

type EditProjectContextErrorCode =
    | 'github_not_installed'
    | 'unsupported_source_control'
    | 'git_write_permission'
    | 'unknown';

const classifyError = (error: unknown): EditProjectContextErrorCode => {
    if (error instanceof WritebackGitNotConnectedError) {
        return error.provider === PullRequestProvider.GITHUB
            ? 'github_not_installed'
            : 'unsupported_source_control';
    }
    if (error instanceof InsufficientGitPermissionsError) {
        return 'git_write_permission';
    }
    return 'unknown';
};

const renderResult = ({
    prAction,
    op,
    content,
}: ToolEditProjectContextStructuredContent) => {
    const verb = prAction === 'updated' ? 'Updated' : 'Opened';
    return `${verb} a pull request that ${
        op === 'update' ? 'updates' : 'adds'
    } a project context entry. A "View pull request" button is shown to the user, so do NOT include the pull request URL in your reply — summarise the entry you wrote ("${content}") and that it now applies to this project's context.`;
};

const toolDefinition = editProjectContextToolDefinition.for('agent');

export const getEditProjectContext = ({ editProjectContext }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            op,
            id,
            kind,
            content,
            terms,
            objects,
        }): Promise<ToolEditProjectContextOutput> => {
            try {
                const { prUrl, prAction } = await editProjectContext({
                    op,
                    id,
                    kind,
                    content,
                    terms,
                    objects,
                });

                const structuredContent: ToolEditProjectContextStructuredContent =
                    { prAction, op, content };
                return {
                    result: renderResult(structuredContent),
                    metadata: {
                        status: 'success',
                        prUrl,
                        prAction,
                    },
                    structuredContent,
                };
            } catch (error) {
                return {
                    ...toolErrorOutput(
                        error,
                        'Error updating project context. No pull request was opened.',
                    ),
                    metadata: {
                        status: 'error',
                        errorCode: classifyError(error),
                    },
                };
            }
        },
        toModelOutput: ({ output }) => toModelOutput(output),
    });
