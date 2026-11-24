import {
    assistantModelMessageSchema,
    toolModelMessageSchema,
    type ModelMessage,
} from 'ai';
import { z } from 'zod';
import { hasBinaryModelInputs } from '../utils/aiCallTelemetry';

/** Bumped when the stored messages change shape; older rows are rebuilt from the database. */
export const TURN_TRANSCRIPT_FORMAT_VERSION = 1;

/** The provider and model id a transcript may be replayed to. */
export const getTranscriptModel = (
    model: string | { provider: string; modelId: string },
): string =>
    typeof model === 'string' ? model : `${model.provider}/${model.modelId}`;

const storedTranscriptSchema = z
    .array(z.union([assistantModelMessageSchema, toolModelMessageSchema]))
    .min(1);

const isStoredTranscript = (messages: unknown): messages is ModelMessage[] =>
    storedTranscriptSchema.safeParse(messages).success;

/** A stored turn's tool steps as stored (bytes kept), or null when they cannot be replayed to this model. */
export const getReplayableTranscript = (
    row: { messages: unknown; format_version: number; model: string },
    model: string,
): ModelMessage[] | null =>
    row.format_version === TURN_TRANSCRIPT_FORMAT_VERSION &&
    row.model === model &&
    isStoredTranscript(row.messages)
        ? row.messages
        : null;

/** Keeps the tool steps as last sent, so later turns hit the prompt cache; user messages and the answer are rebuilt. */
export const createTurnTranscript = ({
    start,
}: {
    /** Index of the turn's first message; earlier ones are system messages and earlier turns. */
    start: number;
}) => {
    let stepMessages: ModelMessage[] = [];
    return {
        recordStep: (messages: ModelMessage[]) => {
            stepMessages = messages;
        },
        /** Null when the turn made no tool calls or holds binary inputs, which do not survive JSON storage. */
        complete: (): ModelMessage[] | null => {
            const messages = stepMessages.filter(
                (message, index) =>
                    index >= start &&
                    (message.role === 'assistant' || message.role === 'tool'),
            );
            return messages.length === 0 || hasBinaryModelInputs(messages)
                ? null
                : messages;
        },
    };
};

export type TurnTranscript = ReturnType<typeof createTurnTranscript>;
