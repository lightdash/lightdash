import {
    AI_AGENT_CONTEXT_OVERFLOW_ERROR_NAME,
    getAiAgentV3ContextTokens,
} from '@lightdash/common';
import {
    type AiCanonicalMessage,
    type AiCompactionPreservedContext,
} from '../../database/entities/aiAgentV3';

export const V3_COMPACTION_RESERVE_TOKENS = 16384;
export const V3_COMPACTION_OUTPUT_RESERVE_RATIO = 0.8;
export const V3_COMPACTION_MAX_OUTPUT_TOKENS = Math.floor(
    V3_COMPACTION_RESERVE_TOKENS * V3_COMPACTION_OUTPUT_RESERVE_RATIO,
);
const TOOL_RESULT_CHAR_LIMIT = 2000;
export const EMPTY_V3_COMPACTION_PRESERVED_CONTEXT: AiCompactionPreservedContext =
    { artifacts: [], pinnedContext: [] };

const SUMMARY_FORMAT = `## Goal
[Goals to continue, or "(none)"]

## Constraints & Preferences
- [Requirements and preferences, or "(none)"]

## Progress
### Done
- [x] [Completed work, or "(none)"]

### In Progress
- [ ] [Current work, or "(none)"]

### Blocked
- [Current blockers, or "(none)"]

## Key Decisions
- **[Decision]**: [Brief rationale, or "(none)"]

## Next Steps
1. [Ordered next action, or "(none)"]

## Critical Context
- [Facts needed to continue, or "(none)"]

Keep each section concise. Preserve exact explore names, metric and dimension names, field identifiers, filter values, SQL snippets, artifact titles, chart and dashboard UUIDs, and error messages.`;

const INITIAL_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

${SUMMARY_FORMAT}`;

const UPDATE_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE Progress: move items from "In Progress" to "Done" when completed
- UPDATE Next Steps based on what was accomplished
- PRESERVE exact explore names, metric and dimension names, field identifiers, filter values, SQL snippets, artifact titles, chart and dashboard UUIDs, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

${SUMMARY_FORMAT}`;

const safeStringify = (value: unknown): string => {
    const seen = new WeakSet<object>();
    try {
        return (
            JSON.stringify(value, (_, item: unknown) => {
                if (typeof item === 'bigint') return `${item.toString()}n`;
                if (item !== null && typeof item === 'object') {
                    if (seen.has(item)) return '[Circular]';
                    seen.add(item);
                }
                return item;
            }) ?? String(value)
        );
    } catch {
        return '[Unserializable]';
    }
};

const getV3CompactionPart = (message: AiCanonicalMessage) => {
    if (message.role !== 'compaction') return null;
    return (
        message.parts.find((part) => part.type === 'compaction')?.payload ??
        null
    );
};

const stringArray = (value: unknown): string[] =>
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];

export const getV3CompactionSummary = (
    message: AiCanonicalMessage,
): string | null => {
    const summary = getV3CompactionPart(message)?.summary;
    return typeof summary === 'string' && summary.length > 0 ? summary : null;
};

export const getV3CompactionPreservedContext = (
    message: AiCanonicalMessage,
): AiCompactionPreservedContext => {
    const preservedContext = getV3CompactionPart(message)?.preservedContext;
    if (preservedContext === null || typeof preservedContext !== 'object') {
        return EMPTY_V3_COMPACTION_PRESERVED_CONTEXT;
    }
    const value = preservedContext as Record<string, unknown>;
    return {
        artifacts: stringArray(value.artifacts),
        pinnedContext: stringArray(value.pinnedContext),
    };
};

export const renderV3CompactionReplaySummary = (
    summary: string,
    preservedContext: AiCompactionPreservedContext,
): string =>
    [
        summary,
        ...(preservedContext.artifacts.length > 0
            ? [
                  `<artifacts>\n${preservedContext.artifacts.join('\n')}\n</artifacts>`,
              ]
            : []),
        ...(preservedContext.pinnedContext.length > 0
            ? [
                  `<pinned-context>\n${preservedContext.pinnedContext.join('\n')}\n</pinned-context>`,
              ]
            : []),
    ].join('\n\n');

export const selectV3CompactionContext = (
    messages: AiCanonicalMessage[],
): {
    previousSummary: string | null;
    previousPreservedContext: AiCompactionPreservedContext;
    messagesToCompact: AiCanonicalMessage[];
} => {
    const latestCompactionIndex = messages.findLastIndex(
        (message) => message.role === 'compaction',
    );
    if (latestCompactionIndex < 0) {
        return {
            previousSummary: null,
            previousPreservedContext: EMPTY_V3_COMPACTION_PRESERVED_CONTEXT,
            messagesToCompact: messages,
        };
    }
    return {
        previousSummary: getV3CompactionSummary(
            messages[latestCompactionIndex],
        ),
        previousPreservedContext: getV3CompactionPreservedContext(
            messages[latestCompactionIndex],
        ),
        messagesToCompact: messages.slice(latestCompactionIndex + 1),
    };
};

export const getLatestV3Assistant = (
    messages: AiCanonicalMessage[],
): AiCanonicalMessage | null =>
    messages.findLast((message) => message.role === 'assistant') ?? null;

export type V3CompactionTrigger =
    | typeof AI_AGENT_CONTEXT_OVERFLOW_ERROR_NAME
    | 'threshold';

/**
 * Context-window occupancy after a run, not its billing total: `totalTokens` is
 * summed over every step of the tool loop and routinely exceeds the window.
 * Null for pre-v2 envelopes, which disables threshold compaction for that
 * message — the context-overflow trigger remains the backstop.
 */
export const getV3AssistantContextTokens = (
    latestAssistant: AiCanonicalMessage | null,
): number | null =>
    getAiAgentV3ContextTokens(latestAssistant?.metadata.tokenUsage);

export const getV3CompactionTrigger = ({
    latestAssistant,
    supportsCompaction,
    contextWindowTokens,
}: {
    latestAssistant: AiCanonicalMessage | null;
    supportsCompaction: boolean;
    contextWindowTokens: number | null;
}): V3CompactionTrigger | null => {
    if (
        latestAssistant?.metadata.error?.name ===
        AI_AGENT_CONTEXT_OVERFLOW_ERROR_NAME
    ) {
        return AI_AGENT_CONTEXT_OVERFLOW_ERROR_NAME;
    }
    if (!supportsCompaction || contextWindowTokens === null) return null;
    const contextTokens = getV3AssistantContextTokens(latestAssistant);
    return contextTokens !== null &&
        contextTokens > contextWindowTokens - V3_COMPACTION_RESERVE_TOKENS
        ? 'threshold'
        : null;
};

export const resolveV3CompactionContextWindow = (
    configuredTokens: number,
    override: number | null,
): number =>
    Number.isInteger(override) &&
    override !== null &&
    override > V3_COMPACTION_RESERVE_TOKENS
        ? override
        : configuredTokens;

const describePinnedContext = (
    context: AiCanonicalMessage['metadata']['context'][number],
) =>
    `${context.entityType} ${context.displayName ?? context.entityRef ?? context.entityUuid ?? context.uuid} (${context.pinnedVersionUuid ?? context.entityUuid ?? context.uuid})`;

const describeArtifact = (part: AiCanonicalMessage['parts'][number]) =>
    `${String(part.payload.title ?? part.artifactVersionUuid ?? part.uuid)} (${part.artifactVersionUuid ?? part.uuid})`;

export const mergeV3CompactionPreservedContext = (
    previous: AiCompactionPreservedContext,
    messages: AiCanonicalMessage[],
): AiCompactionPreservedContext => {
    const artifacts = new Set(previous.artifacts);
    const pinnedContext = new Set(previous.pinnedContext);
    messages.forEach((message) => {
        message.metadata.context.forEach((context) => {
            pinnedContext.add(describePinnedContext(context));
        });
        message.parts.forEach((part) => {
            if (part.type === 'artifact') {
                artifacts.add(describeArtifact(part));
            }
        });
    });
    return {
        artifacts: [...artifacts],
        pinnedContext: [...pinnedContext],
    };
};

const truncateToolResult = (value: unknown): string => {
    const serialized = safeStringify(value);
    if (serialized.length <= TOOL_RESULT_CHAR_LIMIT) return serialized;
    return `${serialized.slice(0, TOOL_RESULT_CHAR_LIMIT)}\n...[truncated ${serialized.length - TOOL_RESULT_CHAR_LIMIT} chars]`;
};

export const serializeV3Conversation = (
    messages: AiCanonicalMessage[],
): string => {
    const lines: string[] = [];
    messages.forEach((message) => {
        if (message.role === 'compaction') return;
        if (message.role === 'user') {
            const text = message.parts
                .filter((part) => part.type === 'text')
                .map((part) => part.payload.text)
                .filter((value): value is string => typeof value === 'string')
                .join('');
            if (text) lines.push(`[User]: ${text}`);
            message.metadata.context.forEach((context) => {
                lines.push(
                    `[Pinned context]: ${describePinnedContext(context)}`,
                );
            });
            return;
        }

        message.parts.forEach((part) => {
            if (part.type === 'text' && typeof part.payload.text === 'string') {
                lines.push(`[Assistant]: ${part.payload.text}`);
                return;
            }
            if (part.type === 'tool') {
                const toolName =
                    typeof part.payload.toolName === 'string'
                        ? part.payload.toolName
                        : 'unknown';
                lines.push(
                    `[Assistant tool call: ${toolName} (${part.toolCallId ?? 'unknown'})]: ${safeStringify(part.payload.input)}`,
                );
                if (part.payload.output !== undefined) {
                    lines.push(
                        `[Tool result: ${toolName}]: ${truncateToolResult(part.payload.output)}`,
                    );
                } else if (part.payload.error !== undefined) {
                    lines.push(
                        `[Tool error: ${toolName}]: ${truncateToolResult(part.payload.error)}`,
                    );
                }
                return;
            }
            if (part.type === 'artifact') {
                lines.push(`[Artifact]: ${describeArtifact(part)}`);
                return;
            }
            if (part.type === 'file' || part.type === 'source') {
                lines.push(`[${part.type}]: ${safeStringify(part.payload)}`);
            }
        });
        if (message.metadata.error) {
            lines.push(`[Assistant error]: ${message.metadata.error.message}`);
        }
    });
    return lines.join('\n');
};

export const buildV3CompactionInput = ({
    conversation,
    previousSummary,
}: {
    conversation: string;
    previousSummary: string | null;
}): string =>
    [
        `<conversation>\n${conversation}\n</conversation>`,
        ...(previousSummary
            ? [`<previous-summary>\n${previousSummary}\n</previous-summary>`]
            : []),
        previousSummary ? UPDATE_PROMPT : INITIAL_PROMPT,
    ].join('\n\n');
