import type { ModelMessage } from 'ai';
import { hasBinaryModelInputs } from '../utils/aiCallTelemetry';

/**
 * Keeps the messages the latest step sent, so a finished turn can be stored and
 * replayed on the next turn exactly as the provider saw it (prompt cache hit).
 * Leading system, compaction and memory messages are rebuilt every turn and left out.
 */
export const createTurnTranscript = (leadingMessageCount: number) => {
    let stepMessages: ModelMessage[] = [];
    return {
        recordStep: (messages: ModelMessage[]) => {
            stepMessages = messages;
        },
        /** Null when the turn holds binary inputs, which do not survive JSON storage. */
        complete: (
            finalStepResponse: readonly ModelMessage[],
        ): ModelMessage[] | null => {
            const messages = [
                ...stepMessages.slice(leadingMessageCount),
                ...finalStepResponse,
            ];
            return hasBinaryModelInputs(messages) ? null : messages;
        },
    };
};

export type TurnTranscript = ReturnType<typeof createTurnTranscript>;
