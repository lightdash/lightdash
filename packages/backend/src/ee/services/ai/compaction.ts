import {
    assertUnreachable,
    type AiAgentMessage,
    type AiPromptContext,
    type AiPromptContextItem,
} from '@lightdash/common';
import { type ModelMessage } from 'ai';

const TOOL_RESULT_CHAR_LIMIT = 2000;
const SUMMARY_MESSAGE_PREFIX =
    'Earlier conversation summary for this thread:\n\n';

export class Compaction {
    static readonly RESERVE_TOKENS = 16384;

    static shouldCompactPrompt({
        totalTokens,
        contextWindowTokens,
        reserveTokens = Compaction.RESERVE_TOKENS,
    }: {
        totalTokens: number | null | undefined;
        contextWindowTokens: number;
        reserveTokens?: number;
    }): boolean {
        return (
            typeof totalTokens === 'number' &&
            totalTokens > contextWindowTokens - reserveTokens
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
            case 'dashboard':
                return `dashboard ${item.displayName ?? item.dashboardUuid} (${item.dashboardUuid})`;
            case 'thread':
                return `conversation ${item.displayName ?? item.threadUuid} (${item.threadUuid})`;
            // Spell out the repo-filesystem mount path so the agent reads the
            // exact file/repo with exploreRepo and never confuses a file path
            // with an `owner/repo` repository.
            case 'file':
                return `file /dbt/${item.path} (a source file in the dbt project; read it with exploreRepo)`;
            case 'repository':
                return `repository ${item.fullName} (mounted at /${item.fullName}; explore it with exploreRepo)`;
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
