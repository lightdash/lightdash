import {
    assertUnreachable,
    type AiAgentMessageAssistant,
} from '@lightdash/common';
import { type StreamPart } from '../../store/aiAgentThreadStreamSlice';
import { isHiddenToolName } from './hiddenToolNames';
import {
    appendToolCallToActivityGroup,
    canAppendToolCallToActivityGroup,
    createToolCallActivityGroup,
    type ToolCallActivityGroup,
} from './ToolCalls/utils/toolCallGrouping';
import { type ToolCallSummary } from './ToolCalls/utils/types';

type ToolGroup = ToolCallActivityGroup & { kind: 'toolGroup' };
type TextSegment = { kind: 'text'; text: string };
export type ResponseSegment = TextSegment | ToolGroup;

export const getToolGroups = (segments: ResponseSegment[]): ToolGroup[] =>
    segments.filter((s): s is ToolGroup => s.kind === 'toolGroup');

type ActivityItem =
    | { type: 'text'; text: string }
    | { type: 'toolCall'; call: ToolCallSummary };

const segmentActivityItems = (items: ActivityItem[]): ResponseSegment[] => {
    const segments: ResponseSegment[] = [];
    items.forEach((item) => {
        if (item.type === 'text') {
            segments.push({ kind: 'text', text: item.text });
            return;
        }
        const { call } = item;
        if (isHiddenToolName(call.toolName)) {
            return;
        }
        const last = segments[segments.length - 1];
        if (
            last &&
            last.kind === 'toolGroup' &&
            canAppendToolCallToActivityGroup(last, call)
        ) {
            appendToolCallToActivityGroup(last, call);
            return;
        }
        segments.push({
            ...createToolCallActivityGroup(call),
            kind: 'toolGroup',
        });
    });
    return segments;
};

export const segmentStreamParts = (parts: StreamPart[]): ResponseSegment[] =>
    segmentActivityItems(
        parts.map((part): ActivityItem => {
            switch (part.type) {
                case 'text':
                    return part;
                case 'toolCall':
                    return {
                        type: 'toolCall',
                        call: {
                            toolCallId: part.toolCallId,
                            toolName: part.toolName,
                            toolArgs: part.toolArgs,
                            toolOutput: part.toolResult ?? undefined,
                            isPreliminary: part.isPreliminary,
                        },
                    };
                default:
                    return assertUnreachable(part, 'Unknown stream part');
            }
        }),
    );

/** Null for prompts persisted before response parts existed. */
export const segmentPersistedResponse = (
    message: AiAgentMessageAssistant,
): ResponseSegment[] | null => {
    const parts = message.responseParts;
    if (!parts) return null;
    const callsById = new Map(
        message.toolCalls.map((call) => [call.toolCallId, call]),
    );
    const partItems = parts.flatMap((part): ActivityItem[] => {
        switch (part.type) {
            case 'text':
                return [part];
            case 'tool': {
                // The tool-call row can fail to persist; there's nothing to render then
                const call = callsById.get(part.toolCallId);
                return call ? [{ type: 'toolCall', call }] : [];
            }
            default:
                return assertUnreachable(part, 'Unknown response part');
        }
    });
    // Parts cover the last run only; calls from before a resume (e.g. SQL approval) lead
    const referencedIds = new Set(
        parts.flatMap((part) =>
            part.type === 'tool' ? [part.toolCallId] : [],
        ),
    );
    const earlierItems = message.toolCalls
        .filter(
            (call) =>
                call.parentToolCallId === null &&
                !referencedIds.has(call.toolCallId),
        )
        .map((call): ActivityItem => ({ type: 'toolCall', call }));
    return segmentActivityItems([...earlierItems, ...partItems]);
};

/**
 * Splits segments into the answer and the narration that preceded each tool
 * group. Settled: the answer is every text after the last tool group. While
 * streaming it's the latest text, so the preview rolls forward.
 */
export const splitAnswerAndNarration = (
    allSegments: ResponseSegment[],
    isStreaming: boolean,
): { answer: string; narrationByGroupKey: Record<string, string[]> } => {
    const segments = allSegments.filter(
        (s) => s.kind === 'toolGroup' || s.text.trim(),
    );
    const lastToolIdx = segments.findLastIndex((s) => s.kind === 'toolGroup');
    const lastTextIdx = segments.findLastIndex((s) => s.kind === 'text');
    const isAnswer = (idx: number) =>
        isStreaming ? idx === lastTextIdx : idx > lastToolIdx;

    const answer: string[] = [];
    const narrationByGroupKey: Record<string, string[]> = {};
    let pending: string[] = [];
    segments.forEach((segment, idx) => {
        if (segment.kind === 'toolGroup') {
            if (pending.length > 0) {
                narrationByGroupKey[segment.keyId] = pending;
                pending = [];
            }
            return;
        }
        if (isAnswer(idx)) answer.push(segment.text);
        else pending.push(segment.text);
    });
    return { answer: answer.join('\n\n'), narrationByGroupKey };
};
