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

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const renderPullRequests = (
    workstreams: ToolListWorkstreamsStructuredContent['workstreams'],
) =>
    workstreams.map(
        (w) =>
            `• ${w.repository} #${w.prNumber} — ${w.prUrl}${
                w.summary ? `\n  ${w.summary}` : ''
            }`,
    );

const renderResult = (
    repoTarget: string | null,
    {
        workstreams,
        pendingChanges,
        otherConversations,
    }: Omit<ToolListWorkstreamsStructuredContent, 'repoTarget'>,
): string => {
    const scope = repoTarget ? ` on ${repoTarget}` : '';
    const lines: string[] = [];
    if (workstreams.length > 0) {
        lines.push(
            `${plural(workstreams.length, 'pull request')} opened in this conversation${scope}. To continue one, pass its URL as the edit tool's \`prUrl\`; for an unrelated change, set \`startNewPullRequest\`:`,
            ...renderPullRequests(workstreams),
        );
    }
    if (pendingChanges.length > 0) {
        const oldest = Math.max(
            ...pendingChanges.map((p) => p.startedMinutesAgo),
        );
        lines.push(
            `${plural(pendingChanges.length, 'change')} started ${plural(oldest, 'minute')} ago ${
                pendingChanges.length === 1 ? 'is' : 'are'
            } still being opened; the pull request will appear here when done.`,
        );
    }
    if (lines.length === 0) {
        lines.push(
            `This conversation has not opened any pull requests${scope} yet.`,
        );
    }
    if (otherConversations.length > 0) {
        lines.push(
            `${plural(otherConversations.length, 'pull request')} opened by other conversations on this project${scope}. Continue one with \`prUrl\` when the change belongs to it:`,
            ...renderPullRequests(otherConversations),
        );
    }
    return lines.join('\n');
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
                const listed = await listWorkstreams({ repoTarget });
                const now = Date.now();
                const strip = ({
                    repository,
                    prNumber,
                    prUrl,
                    summary,
                }: (typeof listed.workstreams)[number]) => ({
                    repository,
                    prNumber,
                    prUrl,
                    summary,
                });
                const structuredContent: ToolListWorkstreamsStructuredContent =
                    {
                        repoTarget,
                        workstreams: listed.workstreams.map(strip),
                        pendingChanges: listed.pendingStartedAt.map(
                            (startedAt) => ({
                                startedMinutesAgo: Math.max(
                                    0,
                                    Math.floor(
                                        (now - startedAt.getTime()) / 60_000,
                                    ),
                                ),
                            }),
                        ),
                        otherConversations: listed.otherThreads.map(strip),
                    };

                return {
                    result: renderResult(repoTarget, structuredContent),
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
