import { type UUID } from '@lightdash/common';
import { stripMemoryCitations } from '../ai/utils/memoryCitation';
import {
    transformToolForDistill,
    type DistillToolOutput,
} from './transcriptToolPolicy';

const UUID_PATTERN = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi;

export type TranscriptTool = {
    toolCallId: string;
    name: string;
    args: unknown;
    result: string | null;
    resultIsError: boolean;
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
    feedback: { score: number; comment: string | null } | null;
    steers: string[];
    tools: TranscriptTool[];
};

export type TranscriptThread = {
    threadUuid: UUID;
    projectUuid: UUID;
    title: string | null;
    createdFrom: string;
    turns: TranscriptTurn[];
};

export type DistillTranscript = {
    createdFrom: string;
    turns: Array<{
        index: number;
        user: string;
        delivery?: 'errored' | 'interrupted' | 'uncertain';
        tools?: DistillToolOutput[];
        assistant?: string;
        error?: string;
        feedback?: { score: number; comment?: string };
        steers?: string[];
    }>;
};

const stripUuids = (value: string): string =>
    value.replace(UUID_PATTERN, '[uuid]');

const sanitizeText = (value: string): string =>
    stripUuids(stripMemoryCitations(value));

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

export const sanitizeThread = async (
    thread: TranscriptThread,
    options: { onUnknownTool?: (toolName: string) => void } = {},
): Promise<DistillTranscript> => ({
    createdFrom: thread.createdFrom,
    turns: await Promise.all(
        thread.turns.map(async (turn, index) => {
            let delivery: 'errored' | 'interrupted' | 'uncertain' | undefined;
            if (turn.interrupted) delivery = 'interrupted';
            else if (turn.errorMessage) delivery = 'errored';
            else if (!turn.respondedAt || !turn.assistantText)
                delivery = 'uncertain';

            const tools = (
                await Promise.all(
                    turn.tools.map((tool) =>
                        transformToolForDistill(tool, {
                            sanitizeText,
                            sanitizeUnknown,
                            onUnknownTool: options.onUnknownTool,
                        }),
                    ),
                )
            ).filter((tool): tool is DistillToolOutput => tool !== null);
            const feedback =
                turn.feedback && turn.feedback.score !== 0
                    ? {
                          score: turn.feedback.score,
                          ...(turn.feedback.comment
                              ? { comment: sanitizeText(turn.feedback.comment) }
                              : {}),
                      }
                    : undefined;
            const steers = turn.steers.map(sanitizeText);

            return {
                index: index + 1,
                user: sanitizeText(turn.userText),
                ...(delivery ? { delivery } : {}),
                ...(tools.length > 0 ? { tools } : {}),
                ...(turn.assistantText
                    ? { assistant: sanitizeText(turn.assistantText) }
                    : {}),
                ...(turn.errorMessage
                    ? { error: sanitizeText(turn.errorMessage) }
                    : {}),
                ...(feedback ? { feedback } : {}),
                ...(steers.length > 0 ? { steers } : {}),
            };
        }),
    ),
});
