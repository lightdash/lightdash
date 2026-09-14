import {
    assertUnreachable,
    elementReferenceToWireString,
    type AiAgentMessage,
    type AiPromptContext,
    type AiPromptContextItem,
    type AiPromptTokenUsage,
} from '@lightdash/common';
import { type ModelMessage } from 'ai';
import { getContextOccupancyTokens } from './promptTokenUsage';

const TOOL_RESULT_CHAR_LIMIT = 2000;
const SUMMARY_MESSAGE_PREFIX =
    'Earlier conversation summary for this thread:\n\n';

export class Compaction {
    static readonly RESERVE_TOKENS = 16384;

    // Takes the whole usage record, not a bare number, so the cumulative
    // billing total can't be mistaken for context occupancy.
    static shouldCompactPrompt({
        tokenUsage,
        contextWindowTokens,
        reserveTokens = Compaction.RESERVE_TOKENS,
    }: {
        tokenUsage: AiPromptTokenUsage | null | undefined;
        contextWindowTokens: number;
        reserveTokens?: number;
    }): boolean {
        const occupancyTokens = getContextOccupancyTokens(tokenUsage);
        return (
            occupancyTokens !== null &&
            occupancyTokens > contextWindowTokens - reserveTokens
        );
    }

    static createSummaryMessage(summary: string): ModelMessage {
        return {
            role: 'system',
            content: `${SUMMARY_MESSAGE_PREFIX}${summary}`,
        };
    }

    static isCompactionPrompt(
        compaction: Pick<
            { triggering_ai_prompt_uuid: string },
            'triggering_ai_prompt_uuid'
        > | null,
        prompt: Pick<{ promptUuid: string }, 'promptUuid'>,
    ): boolean {
        return compaction?.triggering_ai_prompt_uuid === prompt.promptUuid;
    }

    static getMessagesToCompact<T extends { uuid: string }>(
        threadMessages: T[],
        {
            compactedThroughPromptUuid,
            compactThroughPromptUuid,
        }: {
            compactedThroughPromptUuid: string | null;
            compactThroughPromptUuid: string;
        },
    ): T[] {
        const startIndex = compactedThroughPromptUuid
            ? threadMessages.findLastIndex(
                  (message) => message.uuid === compactedThroughPromptUuid,
              ) + 1
            : 0;
        const endIndex = threadMessages.findLastIndex(
            (message) => message.uuid === compactThroughPromptUuid,
        );

        if (endIndex < startIndex) {
            return [];
        }

        return threadMessages.slice(startIndex, endIndex + 1);
    }

    static filterThreadMessagesAfterCompaction<
        T extends { ai_prompt_uuid: string },
    >(threadMessages: T[], compactedThroughPromptUuid: string | null): T[] {
        if (!compactedThroughPromptUuid) {
            return threadMessages;
        }

        const compactedThroughIndex = threadMessages.findIndex(
            (message) => message.ai_prompt_uuid === compactedThroughPromptUuid,
        );

        if (compactedThroughIndex === -1) {
            return threadMessages;
        }

        return threadMessages.slice(compactedThroughIndex + 1);
    }

    static serializeConversation(messages: AiAgentMessage[]): string {
        const lines: string[] = [];

        for (const message of messages) {
            if (message.role === 'user') {
                lines.push(`[User]: ${message.message}`);
                lines.push(
                    ...Compaction.serializePinnedContext(message.context),
                );
            } else {
                if (message.message) {
                    lines.push(`[Assistant]: ${message.message}`);
                }

                if (message.toolCalls.length > 0) {
                    const toolCalls = message.toolCalls
                        .map(
                            (toolCall) =>
                                `${toolCall.toolName}(${JSON.stringify(
                                    toolCall.toolArgs,
                                )})`,
                        )
                        .join('; ');
                    lines.push(`[Assistant tool calls]: ${toolCalls}`);
                }

                for (const toolResult of message.toolResults) {
                    lines.push(
                        `[Tool result: ${toolResult.toolName}]: ${Compaction.truncateToolResult(
                            toolResult.result,
                        )}`,
                    );
                }

                if (message.artifacts && message.artifacts.length > 0) {
                    lines.push(
                        `[Artifacts]: ${message.artifacts
                            .map(
                                (artifact) =>
                                    `${artifact.artifactType} ${artifact.title}`,
                            )
                            .join('; ')}`,
                    );
                }

                if (
                    message.referencedArtifacts &&
                    message.referencedArtifacts.length > 0
                ) {
                    lines.push(
                        `[Referenced artifacts]: ${message.referencedArtifacts
                            .map(
                                (artifact) =>
                                    `${artifact.artifactType} ${artifact.title}`,
                            )
                            .join('; ')}`,
                    );
                }

                if (message.errorMessage) {
                    lines.push(`[Assistant error]: ${message.errorMessage}`);
                }
            }
        }

        return lines.join('\n');
    }

    private static truncateToolResult(value: string): string {
        if (value.length <= TOOL_RESULT_CHAR_LIMIT) {
            return value;
        }

        const truncatedChars = value.length - TOOL_RESULT_CHAR_LIMIT;

        return `${value.slice(
            0,
            TOOL_RESULT_CHAR_LIMIT,
        )}\n...[truncated ${truncatedChars} chars]`;
    }

    private static serializePinnedContext(context: AiPromptContext): string[] {
        if (context.length === 0) {
            return [];
        }

        return [
            '[Pinned context]:',
            ...context.map(
                (item) => `- ${Compaction.serializePinnedContextItem(item)}`,
            ),
        ];
    }

    private static serializePinnedContextItem(
        item: AiPromptContextItem,
    ): string {
        switch (item.type) {
            case 'chart':
                return `chart ${item.displayName ?? item.chartUuid} (${item.chartUuid})`;
            case 'dashboard': {
                const activeTab = item.runtimeOverrides?.activeTab;
                return `dashboard ${item.displayName ?? item.dashboardUuid} (${item.dashboardUuid})${
                    activeTab ? `; active tab "${activeTab.name}"` : ''
                }`;
            }
            case 'thread':
                return `conversation ${item.displayName ?? item.threadUuid} (${item.threadUuid})`;
            // Spell out the repo-filesystem mount path so the agent reads the
            // exact file/repo with exploreRepo and never confuses a file path
            // with an `owner/repo` repository.
            case 'file':
                return `file /dbt/${item.path} (a source file in the dbt project; read it with exploreRepo)`;
            case 'repository':
                return `repository ${item.fullName} (mounted at /${item.fullName}; explore it with exploreRepo)`;
            case 'external_source':
                return `external source ${item.displayName} (${item.tables.length} queryable table${item.tables.length === 1 ? '' : 's'}: ${item.tables.map((table) => `${table.tableName} [${table.tableUuid}]`).join(', ')}; query any subset with an external node in runComposerQueries)`;
            case 'pull_request': {
                const number = item.prNumber ? ` #${item.prNumber}` : '';
                return `pull request${number} (${item.status ?? 'open'})${
                    item.title ? ` "${item.title}"` : ''
                }`;
            }
            case 'proposed_change':
                return item.payload.changeKind === 'project_context'
                    ? `proposed project-context entry "${item.payload.entry.content}"`
                    : `proposed semantic-layer change "${item.payload.recommendation.title}"`;
            case 'review_finding': {
                const evidence = item.evidenceExcerpts
                    .map((e) => (e.redacted ? '[redacted]' : `"${e.text}"`))
                    .join(', ');
                return `review finding "${item.title}" (${item.rootCause}, seen ${item.findingCount}×)${
                    evidence ? `; evidence: ${evidence}` : ''
                }`;
            }
            case 'preview_environment':
                return `preview environment${
                    item.projectName ? ` (${item.projectName})` : ''
                }${item.status ? ` — ${item.status}` : ''}`;
            case 'data_app':
                return `data app ${item.displayName ?? item.appUuid} (${item.appSlug ?? item.appUuid})`;
            case 'data_app_element':
                return `element reference ${elementReferenceToWireString(item)} in data app ${item.displayName ?? item.appUuid} (${item.appUuid}, version ${item.version}; copy it verbatim into the iterateDataApp brief)`;
            case 'data_app_restore':
                return `data app ${item.displayName ?? item.appUuid} (${item.appUuid}) restored version ${item.restoredFromVersion} as version ${item.version}`;
            default:
                return assertUnreachable(
                    item,
                    'Unknown AiPromptContextItem type',
                );
        }
    }
}

// TODO: V2 add token-budgeted keepRecentTokens retention.
// TODO: V2 add turn-splitting / partial-turn compaction.
