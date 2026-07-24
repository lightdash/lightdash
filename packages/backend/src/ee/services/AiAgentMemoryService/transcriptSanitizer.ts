import { type UUID } from '@lightdash/common';

const TOOL_RESULT_LIMIT = 6_000;
const TOOL_RESULT_HEAD = 4_500;
const TOOL_RESULT_TAIL = 1_500;
const UUID_PATTERN = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;

export type TranscriptTool = {
    toolCallId: string;
    name: string;
    args: unknown;
    result: string | null;
    source: 'lightdash' | 'mcp';
};

export type TranscriptTurn = {
    promptUuid: UUID;
    createdAt: Date;
    userText: string;
    assistantText: string | null;
    errorMessage: string | null;
    respondedAt: Date | null;
    interrupted: boolean;
    tools: TranscriptTool[];
};

export type TranscriptThread = {
    threadUuid: UUID;
    projectUuid: UUID;
    title: string | null;
    createdFrom: string;
    turns: TranscriptTurn[];
};

type SanitizedToolResult = {
    content: string;
    truncated: boolean;
    omittedChars: number;
};

type SanitizedTranscript = {
    createdFrom: string;
    turns: Array<{
        index: number;
        status: 'error' | 'interrupted' | 'success' | 'uncertain';
        user: string;
        tools: Array<{
            source: TranscriptTool['source'];
            name: string;
            args: unknown;
            result: SanitizedToolResult | null;
        }>;
        assistant: string;
        error: string | null;
    }>;
};

const stripCitationMarkers = (value: string): string =>
    value.replace(
        /<ld-mem-cite\b[^>]*>\s*<\/ld-mem-cite\s*>|<ld-mem-cite\b[^>]*\/\s*>/gi,
        '',
    );

const stripUuids = (value: string): string =>
    value.replace(UUID_PATTERN, '[uuid]');

const sanitizeText = (value: string): string =>
    stripUuids(stripCitationMarkers(value));

const sanitizeUnknown = (value: unknown): unknown => {
    if (typeof value === 'string') return sanitizeText(value);
    if (Array.isArray(value)) return value.map(sanitizeUnknown);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
                sanitizeText(key),
                sanitizeUnknown(child),
            ]),
        );
    }
    return value;
};

const sanitizeToolResult = (rawValue: string): SanitizedToolResult => {
    const value = sanitizeText(rawValue);
    if (value.length <= TOOL_RESULT_LIMIT) {
        return { content: value, truncated: false, omittedChars: 0 };
    }
    const omittedChars = value.length - TOOL_RESULT_HEAD - TOOL_RESULT_TAIL;
    return {
        content: `${value.slice(0, TOOL_RESULT_HEAD)}\n${value.slice(-TOOL_RESULT_TAIL)}`,
        truncated: true,
        omittedChars,
    };
};

export const sanitizeThread = (
    thread: TranscriptThread,
): SanitizedTranscript => ({
    createdFrom: thread.createdFrom,
    turns: thread.turns.map((turn, index) => {
        let status: 'error' | 'interrupted' | 'success' | 'uncertain' =
            'uncertain';
        if (turn.interrupted) status = 'interrupted';
        else if (turn.errorMessage) status = 'error';
        else if (turn.respondedAt && turn.assistantText) status = 'success';

        return {
            index: index + 1,
            status,
            user: sanitizeText(turn.userText),
            tools: turn.tools.map((tool) => ({
                source: tool.source,
                name: tool.name,
                args: sanitizeUnknown(tool.args),
                result: tool.result ? sanitizeToolResult(tool.result) : null,
            })),
            assistant: turn.assistantText
                ? sanitizeText(turn.assistantText)
                : '',
            error: turn.errorMessage ? sanitizeText(turn.errorMessage) : null,
        };
    }),
});
