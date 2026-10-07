import { assertUnreachable, mcpReadContentArgsSchema } from '@lightdash/common';
import type { ModelMessage, ToolResultPart } from 'ai';
import type { z } from 'zod';

const CONTENT_READ_TOOL_NAME = 'readContent';
// Per content type, so inspecting many charts cannot evict the dashboards they belong to.
export const RETAINED_CONTENT_READS_PER_TYPE = 12;
// Roughly 50k tokens, well under the 120k input that triggers server-side clearing.
export const RETAINED_CONTENT_READ_CHARS = 200_000;

const STUB_PREFIX = 'Earlier read of this content omitted';
const SUPERSEDED_STUB = `${STUB_PREFIX}: the same item was read again later in this conversation; use that read.`;
const EVICTED_STUB = `${STUB_PREFIX} to save context: more recent reads of other content took its place. Read it again if you still need it.`;

type ContentReadKey = {
    type: z.infer<typeof mcpReadContentArgsSchema>['type'];
    item: string;
};

const toContentReadKey = (input: unknown): ContentReadKey | null => {
    const parsed = mcpReadContentArgsSchema.safeParse(input);
    if (!parsed.success) return null;
    const { type, slug, documentUuid, chartId } = parsed.data;
    const item = slug ?? documentUuid;
    if (item === undefined) return null;
    return { type, item: chartId ? `${item}#${chartId}` : item };
};

const serializeKey = ({ type, item }: ContentReadKey) => `${type}:${item}`;

// The current run yields `text`; reads replayed from earlier prompts in the thread
// are rebuilt as `json` holding the stored string, or `{ result, status }`.
const toSuccessfulReadBody = (
    output: ToolResultPart['output'],
): string | null => {
    switch (output.type) {
        case 'text':
            return output.value;
        case 'json': {
            const { value } = output;
            if (typeof value === 'string') return value;
            if (
                value === null ||
                typeof value !== 'object' ||
                !('result' in value) ||
                typeof value.result !== 'string'
            )
                return null;
            return 'status' in value && value.status === 'error'
                ? null
                : value.result;
        }
        case 'error-text':
        case 'error-json':
        case 'execution-denied':
        case 'content':
            return null;
        default:
            return assertUnreachable(output, 'Unknown tool result output');
    }
};

type ContentRead = { toolCallId: string; key: ContentReadKey; size: number };

const collectContentReads = (messages: ModelMessage[]): ContentRead[] => {
    const keysByCallId = new Map<string, ContentReadKey>();
    const reads: ContentRead[] = [];
    messages.forEach((message) => {
        if (message.role === 'assistant' && Array.isArray(message.content)) {
            message.content.forEach((part) => {
                if (
                    part.type !== 'tool-call' ||
                    part.toolName !== CONTENT_READ_TOOL_NAME
                )
                    return;
                const key = toContentReadKey(part.input);
                if (key) keysByCallId.set(part.toolCallId, key);
            });
        }
        if (message.role === 'tool') {
            message.content.forEach((part) => {
                if (
                    part.type !== 'tool-result' ||
                    part.toolName !== CONTENT_READ_TOOL_NAME
                )
                    return;
                const body = toSuccessfulReadBody(part.output);
                if (body === null || body.startsWith(STUB_PREFIX)) return;
                const key = keysByCallId.get(part.toolCallId);
                if (key)
                    reads.push({
                        toolCallId: part.toolCallId,
                        key,
                        size: body.length,
                    });
            });
        }
    });
    return reads;
};

// Ordered by the position of each item's latest read, oldest first.
const latestReadPerItem = (reads: ContentRead[]): ContentRead[] => {
    const latestByKey = new Map<string, ContentRead>();
    reads.forEach((read) => {
        const key = serializeKey(read.key);
        latestByKey.delete(key);
        latestByKey.set(key, read);
    });
    return [...latestByKey.values()];
};

const beyondPerTypeCap = (latest: ContentRead[]): ContentRead[] => {
    const byType = new Map<ContentReadKey['type'], ContentRead[]>();
    latest.forEach((read) => {
        byType.set(read.key.type, [...(byType.get(read.key.type) ?? []), read]);
    });
    return [...byType.values()].flatMap((typeReads) =>
        typeReads.slice(
            0,
            Math.max(0, typeReads.length - RETAINED_CONTENT_READS_PER_TYPE),
        ),
    );
};

// The newest read always stays, so the agent is never told to re-read what it just read.
const beyondCharBudget = (latest: ContentRead[]): ContentRead[] => {
    const newestFirst = [...latest].reverse();
    const evicted: ContentRead[] = [];
    newestFirst.reduce((total, read, index) => {
        const next = total + read.size;
        if (index > 0 && next > RETAINED_CONTENT_READ_CHARS) evicted.push(read);
        return next;
    }, 0);
    return evicted;
};

const planStubs = (reads: ContentRead[]): Map<string, string> => {
    const latest = latestReadPerItem(reads);
    const latestCallIds = new Set(latest.map((read) => read.toolCallId));

    const stubs = new Map<string, string>();
    reads.forEach((read) => {
        if (!latestCallIds.has(read.toolCallId))
            stubs.set(read.toolCallId, SUPERSEDED_STUB);
    });

    const cappedOut = beyondPerTypeCap(latest);
    cappedOut.forEach((read) => stubs.set(read.toolCallId, EVICTED_STUB));
    const cappedOutIds = new Set(cappedOut.map((read) => read.toolCallId));
    beyondCharBudget(
        latest.filter((read) => !cappedOutIds.has(read.toolCallId)),
    ).forEach((read) => stubs.set(read.toolCallId, EVICTED_STUB));
    return stubs;
};

/**
 * Keeps only the latest successful `readContent` result per content item, and
 * the most recently read items per content type within a character budget, so
 * the content the agent is working on survives server-side tool-result
 * clearing without letting every read accumulate. Eviction drops the item
 * whose latest read is oldest. At most `RETAINED_CONTENT_READS_PER_TYPE` items
 * per content type and `RETAINED_CONTENT_READ_CHARS` characters in total stay
 * in full; a Document read once by slug and once by documentUuid counts as two
 * items. Reads replayed from earlier prompts in the thread are pruned the same
 * way as reads from the current run. Returns the same array when nothing
 * needs replacing.
 */
export const pruneSupersededContentReads = (
    messages: ModelMessage[],
): ModelMessage[] => {
    const stubs = planStubs(collectContentReads(messages));
    if (stubs.size === 0) return messages;
    return messages.map((message) => {
        if (message.role !== 'tool') return message;
        if (
            !message.content.some(
                (part) =>
                    part.type === 'tool-result' && stubs.has(part.toolCallId),
            )
        )
            return message;
        return {
            ...message,
            content: message.content.map((part) => {
                if (part.type !== 'tool-result') return part;
                const stub = stubs.get(part.toolCallId);
                if (stub === undefined) return part;
                return {
                    ...part,
                    output: { type: 'text' as const, value: stub },
                };
            }),
        };
    });
};
