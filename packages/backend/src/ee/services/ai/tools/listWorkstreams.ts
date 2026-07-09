import { listWorkstreamsToolDefinition } from '@lightdash/common';
import type { ListWorkstreamsFn } from '../types/aiAgentDependencies';
import { toolErrorHandler } from '../utils/toolErrorHandler';

type Dependencies = {
    listWorkstreams: ListWorkstreamsFn;
};

const toolDefinition = listWorkstreamsToolDefinition.for('ai-sdk');

export const getListWorkstreams = ({ listWorkstreams }: Dependencies) =>
    toolDefinition.build({
        execute: async ({ repoTarget }) => {
            try {
                const workstreams = await listWorkstreams({ repoTarget });

                if (workstreams.length === 0) {
                    return {
                        status: 'success' as const,
                        type: 'string' as const,
                        result: repoTarget
                            ? `This conversation has not opened any pull requests on ${repoTarget} yet. Use editRepo or editDbtProject to open one.`
                            : 'This conversation has not opened any pull requests yet. Use editRepo or editDbtProject to open one.',
                        metadata: { status: 'success' as const },
                    };
                }

                const lines = [
                    `${workstreams.length} pull request${
                        workstreams.length === 1 ? '' : 's'
                    } opened in this conversation. To continue one, pass its URL as the edit tool's \`prUrl\` (editRepo or editDbtProject); for a separate change set \`startNewPullRequest\`:`,
                    ...workstreams.map(
                        (w) =>
                            `• ${w.repository} #${w.prNumber} — ${w.prUrl}${
                                w.summary ? `\n  ${w.summary}` : ''
                            }`,
                    ),
                ];

                return {
                    status: 'success' as const,
                    type: 'string' as const,
                    result: lines.join('\n'),
                    metadata: { status: 'success' as const },
                };
            } catch (error) {
                return {
                    status: 'error' as const,
                    error: toolErrorHandler(
                        error,
                        'Error listing the pull requests for this conversation.',
                    ),
                    metadata: { status: 'error' as const },
                };
            }
        },
    });
