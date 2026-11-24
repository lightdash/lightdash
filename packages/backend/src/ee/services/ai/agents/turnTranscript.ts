import type { ModelMessage } from 'ai';
import { hasBinaryModelInputs } from '../utils/aiCallTelemetry';

/**
 * Keeps the messages the latest step sent, so a finished turn can be stored and
 * replayed on later turns exactly as the provider saw it (prompt cache hit).
 */
export const createTurnTranscript = ({
    start,
    currentOnlyIndex,
}: {
    /** Index of the turn's first message; earlier ones are system messages and earlier turns. */
    start: number;
    /** A message only this turn sees (content read now); later turns read it fresh. */
    currentOnlyIndex: number | null;
}) => {
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
                ...stepMessages.filter(
                    (_, index) => index >= start && index !== currentOnlyIndex,
                ),
                ...finalStepResponse,
            ];
            return hasBinaryModelInputs(messages) ? null : messages;
        },
    };
};

export type TurnTranscript = ReturnType<typeof createTurnTranscript>;
