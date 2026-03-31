import { generateText, type LanguageModel, type ModelMessage } from 'ai';

/**
 * Rough token estimation: ~4 characters per token.
 * This is intentionally conservative to avoid unnecessary compaction calls.
 */
function estimateTokenCount(messages: ModelMessage[]): number {
    let charCount = 0;
    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            charCount += msg.content.length;
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if ('text' in part && typeof part.text === 'string') {
                    charCount += part.text.length;
                } else if ('input' in part && part.input) {
                    charCount += JSON.stringify(part.input).length;
                } else if ('output' in part && part.output) {
                    charCount += JSON.stringify(part.output).length;
                }
            }
        }
    }
    return Math.ceil(charCount / 4);
}

/**
 * Number of recent messages to keep in full (not summarized).
 * This ensures the model has full context for the most recent exchange.
 */
const RECENT_MESSAGES_TO_KEEP = 10;

/**
 * Token threshold at which compaction is triggered.
 * Set below the model's context limit to leave room for system prompt, tools, and response.
 */
const COMPACTION_TOKEN_THRESHOLD = 60000;

/**
 * Compacts a message history by summarizing older messages when the
 * estimated token count exceeds the threshold. Uses a fast model (e.g. Haiku)
 * to generate the summary.
 *
 * Returns the (possibly compacted) messages and whether compaction was applied.
 */
export async function compactMessagesIfNeeded({
    messages,
    summaryModel,
}: {
    messages: ModelMessage[];
    summaryModel: LanguageModel;
}): Promise<{
    messages: ModelMessage[];
    compacted: boolean;
}> {
    const estimatedTokens = estimateTokenCount(messages);

    if (
        estimatedTokens <= COMPACTION_TOKEN_THRESHOLD ||
        messages.length <= RECENT_MESSAGES_TO_KEEP
    ) {
        return { messages, compacted: false };
    }

    // Split: older messages to summarize, recent messages to keep
    const splitIndex = messages.length - RECENT_MESSAGES_TO_KEEP;
    const olderMessages = messages.slice(0, splitIndex);
    const recentMessages = messages.slice(splitIndex);

    // Build a text representation of older messages for summarization
    const olderMessagesText = olderMessages
        .map((msg) => {
            const role = msg.role;
            let content: string;
            if (typeof msg.content === 'string') {
                content = msg.content;
            } else if (Array.isArray(msg.content)) {
                content = msg.content
                    .map((part) => {
                        if ('text' in part && typeof part.text === 'string') {
                            return part.text;
                        }
                        if ('toolName' in part) {
                            return `[Tool call: ${part.toolName}]`;
                        }
                        if ('output' in part && part.output) {
                            const output =
                                typeof part.output === 'string'
                                    ? part.output
                                    : JSON.stringify(part.output);
                            // Truncate very large tool results
                            return output.length > 2000
                                ? `${output.slice(0, 2000)}... [truncated]`
                                : output;
                        }
                        return '';
                    })
                    .filter(Boolean)
                    .join('\n');
            } else {
                content = JSON.stringify(msg.content);
            }
            return `[${role}]: ${content}`;
        })
        .join('\n\n');

    const result = await generateText({
        model: summaryModel,
        temperature: 0,
        maxOutputTokens: 2000,
        messages: [
            {
                role: 'user',
                content: `Summarize the following conversation history concisely. Preserve:
- Key data questions the user asked
- Important query results and numbers
- Decisions made and conclusions reached
- Any context the user may reference later

Do NOT include pleasantries or meta-commentary. Be factual and concise.

---
${olderMessagesText}
---

Summary:`,
            },
        ],
    });

    const summaryMessage: ModelMessage = {
        role: 'user',
        content: `[Previous conversation summary]\n${result.text}`,
    };

    return {
        messages: [summaryMessage, ...recentMessages],
        compacted: true,
    };
}
