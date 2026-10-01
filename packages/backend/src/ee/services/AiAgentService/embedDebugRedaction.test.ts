import {
    type AiAgentMessageAssistant,
    type AiAgentMessageUser,
    type AiAgentThread,
} from '@lightdash/common';
import { type UIMessageChunk } from 'ai';
import {
    redactStreamToolOutputs,
    redactThreadToolResults,
} from './embedDebugRedaction';

const userMessage = {
    role: 'user',
    uuid: 'prompt-1',
    message: 'Revenue by month',
} as AiAgentMessageUser;

const assistantMessage = {
    role: 'assistant',
    uuid: 'prompt-1',
    message: 'Here is revenue by month',
    toolResults: [
        {
            uuid: 'result-1',
            toolCallId: 'call-1',
            toolName: 'findFields',
            toolType: 'built-in',
            result: '<field id="orders_total_revenue" />',
            metadata: { status: 'success' },
        },
    ],
} as unknown as AiAgentMessageAssistant;

const thread = {
    uuid: 'thread-1',
    messages: [userMessage, assistantMessage],
} as unknown as AiAgentThread;

const readAll = async <T>(stream: ReadableStream<T>): Promise<T[]> => {
    const chunks: T[] = [];
    const reader = stream.getReader();
    for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) return chunks;
        chunks.push(value);
    }
};

describe('redactThreadToolResults', () => {
    it('blanks raw tool output and keeps metadata the chat renders', () => {
        const redacted = redactThreadToolResults(thread);
        const assistant = redacted.messages[1] as AiAgentMessageAssistant;

        expect(assistant.toolResults).toEqual([
            {
                ...assistantMessage.toolResults[0],
                result: '',
            },
        ]);
        expect(assistant.message).toBe(assistantMessage.message);
        expect(redacted.messages[0]).toBe(userMessage);
        expect(assistantMessage.toolResults[0].result).toBe(
            '<field id="orders_total_revenue" />',
        );
    });
});

describe('redactStreamToolOutputs', () => {
    it('blanks raw tool output in stream chunks and passes other chunks through', async () => {
        const chunks: UIMessageChunk[] = [
            { type: 'text-delta', id: 'text-1', delta: 'Revenue' },
            {
                type: 'tool-output-available',
                toolCallId: 'call-1',
                output: {
                    result: '<field id="orders_total_revenue" />',
                    metadata: { status: 'success' },
                },
            },
            {
                type: 'tool-output-available',
                toolCallId: 'call-2',
                output: 'plain output',
            },
        ];
        const stream = new ReadableStream<UIMessageChunk>({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(chunk));
                controller.close();
            },
        });

        expect(await readAll(redactStreamToolOutputs(stream))).toEqual([
            chunks[0],
            {
                type: 'tool-output-available',
                toolCallId: 'call-1',
                output: { result: '', metadata: { status: 'success' } },
            },
            chunks[2],
        ]);
    });
});
