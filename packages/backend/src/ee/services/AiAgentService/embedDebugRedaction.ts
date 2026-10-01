import { type AiAgentThread } from '@lightdash/common';
import { type UIMessageChunk } from 'ai';

/** Raw tool output is debug-only data; embed viewers without the debug scope get it blanked. */
export const redactThreadToolResults = (
    thread: AiAgentThread,
): AiAgentThread => ({
    ...thread,
    messages: thread.messages.map((message) =>
        message.role === 'assistant'
            ? {
                  ...message,
                  toolResults: message.toolResults.map((toolResult) => ({
                      ...toolResult,
                      result: '',
                  })),
              }
            : message,
    ),
});

const redactToolOutput = (output: unknown): unknown =>
    output !== null &&
    typeof output === 'object' &&
    'result' in output &&
    typeof output.result === 'string'
        ? { ...output, result: '' }
        : output;

export const redactStreamToolOutputs = <T extends UIMessageChunk>(
    stream: ReadableStream<T>,
): ReadableStream<T> =>
    stream.pipeThrough(
        new TransformStream<T, T>({
            transform(chunk, controller) {
                controller.enqueue(
                    chunk.type === 'tool-output-available'
                        ? { ...chunk, output: redactToolOutput(chunk.output) }
                        : chunk,
                );
            },
        }),
    );
