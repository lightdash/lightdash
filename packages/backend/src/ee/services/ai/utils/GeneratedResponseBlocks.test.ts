import type { TextStreamPart, ToolSet } from 'ai';
import {
    GeneratedResponseBlocks,
    generatedResponseTransform,
    syntheticTextTransform,
    yamlCodeBlock,
} from './GeneratedResponseBlocks';

const transform = async (
    blocks: GeneratedResponseBlocks,
    chunks: TextStreamPart<ToolSet>[],
) => {
    const stream = new ReadableStream<TextStreamPart<ToolSet>>({
        start(controller) {
            chunks.forEach((chunk) => controller.enqueue(chunk));
            controller.close();
        },
    }).pipeThrough(
        generatedResponseTransform(blocks)({ tools: {}, stopStream: () => {} }),
    );
    const output: TextStreamPart<ToolSet>[] = [];
    await stream.pipeTo(
        new WritableStream({
            write(chunk) {
                output.push(chunk);
            },
        }),
    );
    return output;
};

const text = (chunks: TextStreamPart<ToolSet>[]) =>
    chunks
        .flatMap((chunk) => (chunk.type === 'text-delta' ? chunk.text : []))
        .join('');

describe('generated response blocks', () => {
    it('streams a synthetic response when a tool-only fast path has no text', async () => {
        const chunks: TextStreamPart<ToolSet>[] = [
            { type: 'start' },
            {
                type: 'finish',
                finishReason: 'tool-calls',
                rawFinishReason: undefined,
                totalUsage: {
                    inputTokens: 1,
                    inputTokenDetails: {
                        noCacheTokens: undefined,
                        cacheReadTokens: undefined,
                        cacheWriteTokens: undefined,
                    },
                    outputTokens: 1,
                    outputTokenDetails: {
                        textTokens: undefined,
                        reasoningTokens: undefined,
                    },
                    totalTokens: 2,
                },
            },
        ];
        const stream = new ReadableStream<TextStreamPart<ToolSet>>({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(chunk));
                controller.close();
            },
        }).pipeThrough(
            syntheticTextTransform(
                () => 'Created the chart.',
                0,
            )({
                tools: {},
                stopStream: () => {},
            }),
        );
        const output: TextStreamPart<ToolSet>[] = [];
        await stream.pipeTo(
            new WritableStream({
                write(chunk) {
                    output.push(chunk);
                },
            }),
        );
        expect(text(output)).toBe('Created the chart.');
        expect(output.map(({ type }) => type)).toEqual([
            'start',
            'text-start',
            'text-delta',
            'text-delta',
            'text-delta',
            'text-end',
            'finish',
        ]);
    });

    it('does not duplicate model-authored text', async () => {
        const chunks: TextStreamPart<ToolSet>[] = [
            { type: 'text-start', id: 'answer' },
            { type: 'text-delta', id: 'answer', text: 'Model answer.' },
            { type: 'text-end', id: 'answer' },
            {
                type: 'finish',
                finishReason: 'stop',
                rawFinishReason: undefined,
                totalUsage: {
                    inputTokens: 1,
                    inputTokenDetails: {
                        noCacheTokens: undefined,
                        cacheReadTokens: undefined,
                        cacheWriteTokens: undefined,
                    },
                    outputTokens: 1,
                    outputTokenDetails: {
                        textTokens: undefined,
                        reasoningTokens: undefined,
                    },
                    totalTokens: 2,
                },
            },
        ];
        const stream = new ReadableStream<TextStreamPart<ToolSet>>({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(chunk));
                controller.close();
            },
        }).pipeThrough(
            syntheticTextTransform(
                () => 'Fallback.',
                0,
            )({
                tools: {},
                stopStream: () => {},
            }),
        );
        const output: TextStreamPart<ToolSet>[] = [];
        await stream.pipeTo(
            new WritableStream({
                write(chunk) {
                    output.push(chunk);
                },
            }),
        );
        expect(text(output)).toBe('Model answer.');
    });

    it('delivers exact YAML across every token split, matching persisted rendering', async () => {
        const blocks = new GeneratedResponseBlocks();
        const yaml = yamlCodeBlock(
            'grid:\n  containLabel: true\nseries:\n  - yAxisIndex: 0\n',
        );
        const token = blocks.register(yaml);
        await Promise.all(
            Array.from({ length: token.length + 1 }, async (_, split) => {
                const result = await transform(blocks, [
                    { type: 'text-start', id: 'answer' },
                    {
                        type: 'text-delta',
                        id: 'answer',
                        text: `Export:\n${token.slice(0, split)}`,
                    },
                    {
                        type: 'text-delta',
                        id: 'answer',
                        text: `${token.slice(split)}\nDone.`,
                    },
                    { type: 'text-end', id: 'answer' },
                ]);
                expect(text(result)).toBe(`Export:\n${yaml}\nDone.`);
                expect(text(result)).toBe(
                    blocks.render(`Export:\n${token}\nDone.`),
                );
                expect(result.at(-1)?.type).toBe('text-end');
            }),
        );
    });

    it('leaves ordinary text, reasoning, unknown tokens and other turns unchanged', async () => {
        const blocks = new GeneratedResponseBlocks();
        const token = blocks.register('trusted');
        const chunks: TextStreamPart<ToolSet>[] = [
            { type: 'reasoning-delta', id: 'reason', text: token },
            { type: 'text-delta', id: 'answer', text: `Normal text ${token}` },
            { type: 'text-end', id: 'answer' },
        ];
        expect(await transform(new GeneratedResponseBlocks(), chunks)).toEqual(
            chunks,
        );
        const result = await transform(blocks, chunks);
        expect(result[0]).toEqual(chunks[0]);
        expect(text(result)).toBe('Normal text trusted');
    });

    it('flushes partial tokens in the correct text part without mixing parts', async () => {
        const blocks = new GeneratedResponseBlocks();
        const token = blocks.register('yaml');
        const chunks: TextStreamPart<ToolSet>[] = [
            { type: 'text-delta', id: 'a', text: token.slice(0, 20) },
            { type: 'text-delta', id: 'b', text: token },
            { type: 'text-end', id: 'a' },
            { type: 'text-end', id: 'b' },
        ];
        const result = await transform(blocks, chunks);
        expect(result).toEqual([
            { type: 'text-delta', id: 'b', text: 'yaml' },
            { type: 'text-delta', id: 'a', text: token.slice(0, 20) },
            { type: 'text-end', id: 'a' },
            { type: 'text-end', id: 'b' },
        ]);
        expect(text(await transform(blocks, chunks.slice(0, 1)))).toBe(
            token.slice(0, 20),
        );
    });

    it('does not recursively replace markers inside generated content', () => {
        const blocks = new GeneratedResponseBlocks();
        const token = blocks.register('first');
        const next = blocks.register(`literal: ${token}`);
        expect(blocks.render(next)).toBe(`literal: ${token}`);
    });

    it('uses a fence long enough to preserve backticks in descriptions', () => {
        expect(yamlCodeBlock('description: "```ignore me```"')).toBe(
            '````yaml\ndescription: "```ignore me```"\n````',
        );
    });

    it('bounds generated content and refuses overflow without evicting deliverables', () => {
        const blocks = new GeneratedResponseBlocks();
        expect(() => blocks.register('a'.repeat(500_001))).toThrow('limit');
        const first = blocks.register('first');
        for (let i = 1; i < 20; i += 1) blocks.register('next');
        expect(() => blocks.register('overflow')).toThrow('limit');
        expect(blocks.render(first)).toBe('first');
    });
});
