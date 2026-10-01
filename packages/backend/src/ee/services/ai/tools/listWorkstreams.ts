import {
    listWorkstreamsToolDefinition,
    type ToolListWorkstreamsStructuredContent,
} from '@lightdash/common';
import { tool } from 'ai';
import type { ListWorkstreamsFn } from '../types/aiAgentDependencies';
import type {
    ExecuteStructuredToolResult,
    ExecuteToolErrorResult,
} from '../utils/structuredToolResult';
import { toolErrorOutput } from '../utils/toolErrorHandler';

type Dependencies = {
    listWorkstreams: ListWorkstreamsFn;
};

const toolDefinition = listWorkstreamsToolDefinition.for('agent');

const renderResult = (
    repoTarget: string | null,
    workstreams: ToolListWorkstreamsStructuredContent['workstreams'],
): string => {
    if (workstreams.length === 0) {
        return repoTarget
            ? `This conversation has not opened any pull requests on ${repoTarget} yet. Use editRepo or editDbtProject to open one.`
            : 'This conversation has not opened any pull requests yet. Use editRepo or editDbtProject to open one.';
    }

    return [
        `${workstreams.length} pull request${
            workstreams.length === 1 ? '' : 's'
        } opened in this conversation. To continue one, pass its URL as the edit tool's \`prUrl\` (editRepo or editDbtProject); for a separate change set \`startNewPullRequest\`:`,
        ...workstreams.map(
            (w) =>
                `• ${w.repository} #${w.prNumber} — ${w.prUrl}${
                    w.summary ? `\n  ${w.summary}` : ''
                }`,
        ),
    ].join('\n');
};

export const getListWorkstreams = ({ listWorkstreams }: Dependencies) =>
    tool({
        ...toolDefinition,
        execute: async ({
            repoTarget,
        }): Promise<
            | ExecuteStructuredToolResult<ToolListWorkstreamsStructuredContent>
            | ExecuteToolErrorResult
        > => {
            try {
                const workstreams = await listWorkstreams({ repoTarget });

                const listed = workstreams.map(
                    ({ repository, prNumber, prUrl, summary }) => ({
                        repository,
                        prNumber,
                        prUrl,
                        summary,
                    }),
                );
                // The scope is stated only by the empty-list text.
                const structuredContent: ToolListWorkstreamsStructuredContent =
                    listed.length === 0
                        ? { repoTarget, workstreams: [] }
                        : { workstreams: listed };

                return {
                    result: renderResult(repoTarget, listed),
                    metadata: { status: 'success' },
                    structuredContent,
                };
            } catch (error) {
                return toolErrorOutput(
                    error,
                    'Error listing the pull requests for this conversation.',
                );
            }
        },
    });
