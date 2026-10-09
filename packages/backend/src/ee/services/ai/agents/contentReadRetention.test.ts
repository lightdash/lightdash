import type { mcpReadContentArgsSchema } from '@lightdash/common';
import type { ModelMessage, ToolResultPart } from 'ai';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
    pruneSupersededContentReads,
    RETAINED_CONTENT_READ_CHARS,
    RETAINED_CONTENT_READS_PER_TYPE,
} from './contentReadRetention';

type ReadArgs = z.input<typeof mcpReadContentArgsSchema>;

const toolCall = (
    toolCallId: string,
    toolName: string,
    input: unknown,
): ModelMessage => ({
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId, toolName, input }],
});

const toolResult = (
    toolCallId: string,
    toolName: string,
    output: ToolResultPart['output'],
): ModelMessage => ({
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId, toolName, output }],
});

const read = (
    toolCallId: string,
    args: ReadArgs,
    body = `json of ${toolCallId}`,
) => [
    toolCall(toolCallId, 'readContent', args),
    toolResult(toolCallId, 'readContent', { type: 'text', value: body }),
];

const readEnvelope = (type: ReadArgs['type'], body: string) =>
    `<${type} href="https://example.com/${type}" />\n---\n${body}`;

// Shape of a successful read rebuilt from the database for an earlier prompt in the thread.
const replayedRead = (
    toolCallId: string,
    args: ReadArgs,
    body = `json of ${toolCallId}`,
) => [
    toolCall(toolCallId, 'readContent', args),
    toolResult(toolCallId, 'readContent', {
        type: 'json',
        value: readEnvelope(args.type, body),
    }),
];

const resultOutput = (
    messages: ModelMessage[],
    toolCallId: string,
): ToolResultPart['output'] => {
    const found = messages.flatMap((message) =>
        message.role === 'tool'
            ? message.content.filter(
                  (part): part is ToolResultPart =>
                      part.type === 'tool-result' &&
                      part.toolCallId === toolCallId,
              )
            : [],
    );
    if (!found[0]) throw new Error(`No result for ${toolCallId}`);
    return found[0].output;
};

const resultValue = (messages: ModelMessage[], toolCallId: string): string => {
    const output = resultOutput(messages, toolCallId);
    if (output.type !== 'text' && output.type !== 'json')
        throw new Error(`No text result for ${toolCallId}`);
    if (typeof output.value !== 'string')
        throw new Error(`No string result for ${toolCallId}`);
    return output.value;
};

describe('pruneSupersededContentReads', () => {
    it('returns the same array when there are no content reads', () => {
        const messages: ModelMessage[] = [
            { role: 'user', content: 'add a filter' },
            toolCall('q1', 'runQuery', { explore: 'orders' }),
            toolResult('q1', 'runQuery', { type: 'text', value: 'rows...' }),
        ];
        expect(pruneSupersededContentReads(messages).messages).toBe(messages);
    });

    it('replaces an earlier read of the same item and keeps the newest', () => {
        const messages = [
            ...read(
                'r1',
                { type: 'dashboard', slug: 'sales' },
                'first version',
            ),
            toolCall('e1', 'editContent', { slug: 'sales' }),
            toolResult('e1', 'editContent', {
                type: 'text',
                value: 'invalid filter target',
            }),
            ...read(
                'r2',
                { type: 'dashboard', slug: 'sales' },
                'second version',
            ),
        ];
        const { messages: pruned } = pruneSupersededContentReads(messages);
        expect(resultValue(pruned, 'r1')).toContain('read again later');
        expect(resultValue(pruned, 'r2')).toBe('second version');
    });

    it('treats the same slug under different content types as different items', () => {
        const messages = [
            ...read('r1', { type: 'dashboard', slug: 'sales' }),
            ...read('r2', { type: 'chart', slug: 'sales' }),
        ];
        const { messages: pruned } = pruneSupersededContentReads(messages);
        expect(resultValue(pruned, 'r1')).toBe('json of r1');
        expect(resultValue(pruned, 'r2')).toBe('json of r2');
    });

    it('evicts the oldest items of a type once the per-type cap is exceeded', () => {
        const count = RETAINED_CONTENT_READS_PER_TYPE + 2;
        const messages = Array.from({ length: count }, (_, i) =>
            read(`c${i}`, { type: 'chart', slug: `chart-${i}` }),
        ).flat();
        const { messages: pruned } = pruneSupersededContentReads(messages);
        expect(resultValue(pruned, 'c0')).toContain('took its place');
        expect(resultValue(pruned, 'c1')).toContain('took its place');
        expect(resultValue(pruned, 'c2')).toBe('json of c2');
        expect(resultValue(pruned, `c${count - 1}`)).toBe(
            `json of c${count - 1}`,
        );
    });

    it('re-reading an item moves it to the newest end of the eviction order', () => {
        const initial = Array.from(
            { length: RETAINED_CONTENT_READS_PER_TYPE },
            (_, i) => read(`c${i}`, { type: 'chart', slug: `chart-${i}` }),
        ).flat();
        const messages = [
            ...initial,
            ...read('again0', { type: 'chart', slug: 'chart-0' }, 'chart-0 v2'),
            ...read('new', { type: 'chart', slug: 'chart-new' }),
        ];
        const { messages: pruned } = pruneSupersededContentReads(messages);
        expect(resultValue(pruned, 'c0')).toContain('read again later');
        expect(resultValue(pruned, 'again0')).toBe('chart-0 v2');
        expect(resultValue(pruned, 'c1')).toContain('took its place');
        expect(resultValue(pruned, 'c2')).toBe('json of c2');
        expect(resultValue(pruned, 'new')).toBe('json of new');
    });

    it('does not let many chart reads evict the dashboards read before them', () => {
        const dashboards = Array.from({ length: 10 }, (_, i) =>
            read(`d${i}`, { type: 'dashboard', slug: `dash-${i}` }),
        ).flat();
        const charts = Array.from({ length: 40 }, (_, i) =>
            read(`c${i}`, { type: 'chart', slug: `chart-${i}` }),
        ).flat();
        const { messages: pruned } = pruneSupersededContentReads([
            ...dashboards,
            ...charts,
        ]);
        Array.from({ length: 10 }, (_, i) => i).forEach((i) => {
            expect(resultValue(pruned, `d${i}`)).toBe(`json of d${i}`);
        });
        expect(resultValue(pruned, 'c0')).toContain('took its place');
        expect(resultValue(pruned, 'c39')).toBe('json of c39');
    });

    it('evicts the items read longest ago once the retained reads exceed the character budget', () => {
        const half = 'x'.repeat(RETAINED_CONTENT_READ_CHARS / 2);
        const messages = [
            ...read('d1', { type: 'dashboard', slug: 'dash-1' }, half),
            ...read('c1', { type: 'chart', slug: 'chart-1' }, half),
            ...read('d2', { type: 'dashboard', slug: 'dash-2' }, half),
        ];
        const { messages: pruned } = pruneSupersededContentReads(messages);
        expect(resultValue(pruned, 'd1')).toContain('took its place');
        expect(resultValue(pruned, 'c1')).toBe(half);
        expect(resultValue(pruned, 'd2')).toBe(half);
    });

    it('always keeps the newest read even when it alone exceeds the character budget', () => {
        const huge = 'x'.repeat(RETAINED_CONTENT_READ_CHARS + 1);
        const messages = [
            ...read('d1', { type: 'dashboard', slug: 'dash-1' }, 'small'),
            ...read('d2', { type: 'dashboard', slug: 'dash-2' }, huge),
        ];
        const { messages: pruned } = pruneSupersededContentReads(messages);
        expect(resultValue(pruned, 'd1')).toContain('took its place');
        expect(resultValue(pruned, 'd2')).toBe(huge);
    });

    it('leaves non-read tool results and failed reads untouched', () => {
        const messages = [
            ...read('r1', { type: 'dashboard', slug: 'sales' }, 'v1'),
            toolCall('q1', 'runQuery', { explore: 'orders' }),
            toolResult('q1', 'runQuery', { type: 'text', value: 'rows...' }),
            toolCall('r2', 'readContent', { type: 'dashboard', slug: 'sales' }),
            toolResult('r2', 'readContent', {
                type: 'error-text',
                value: 'not found',
            }),
            ...read('r3', { type: 'dashboard', slug: 'sales' }, 'v3'),
        ];
        const { messages: pruned } = pruneSupersededContentReads(messages);
        expect(resultValue(pruned, 'q1')).toBe('rows...');
        expect(resultOutput(pruned, 'r2')).toEqual({
            type: 'error-text',
            value: 'not found',
        });
        expect(resultValue(pruned, 'r3')).toBe('v3');
    });

    it('prunes reads replayed from earlier prompts in the thread like current reads', () => {
        const previousTurn = [
            { role: 'user' as const, content: 'look at the dashboards' },
            ...replayedRead('p1', { type: 'dashboard', slug: 'sales' }, 'v1'),
            ...Array.from({ length: RETAINED_CONTENT_READS_PER_TYPE }, (_, i) =>
                replayedRead(`p${i + 2}`, {
                    type: 'dashboard',
                    slug: `dash-${i}`,
                }),
            ).flat(),
            { role: 'assistant' as const, content: 'Done.' },
        ];
        const currentTurn = [
            { role: 'user' as const, content: 'now edit sales' },
            ...read('r1', { type: 'dashboard', slug: 'sales' }, 'v2'),
        ];
        const { messages: pruned } = pruneSupersededContentReads([
            ...previousTurn,
            ...currentTurn,
        ]);
        expect(resultValue(pruned, 'p1')).toContain('read again later');
        expect(resultValue(pruned, 'p2')).toContain('took its place');
        expect(resultValue(pruned, 'p3')).toBe(
            readEnvelope('dashboard', 'json of p3'),
        );
        expect(resultValue(pruned, 'r1')).toBe('v2');
    });

    it('does not bring back in full a read already stubbed in a previous prompt', () => {
        const count = RETAINED_CONTENT_READS_PER_TYPE + 1;
        const previousTurn = Array.from({ length: count }, (_, i) =>
            replayedRead(`p${i}`, { type: 'chart', slug: `chart-${i}` }),
        ).flat();
        const { messages: pruned } = pruneSupersededContentReads([
            ...previousTurn,
            { role: 'assistant', content: 'Done.' },
            { role: 'user', content: 'next' },
        ]);
        expect(resultValue(pruned, 'p0')).toContain('took its place');
        expect(resultValue(pruned, 'p1')).toBe(
            readEnvelope('chart', 'json of p1'),
        );
    });

    it('skips replayed reads whose stored status is an error', () => {
        const messages = [
            toolCall('p1', 'readContent', { type: 'dashboard', slug: 'sales' }),
            toolResult('p1', 'readContent', {
                type: 'json',
                value: { result: 'not found', status: 'error' },
            }),
            toolCall('p2', 'readContent', { type: 'dashboard', slug: 'sales' }),
            toolResult('p2', 'readContent', {
                type: 'json',
                value: { result: 'v1', status: 'success' },
            }),
            ...read('r1', { type: 'dashboard', slug: 'sales' }, 'v2'),
        ];
        const { messages: pruned } = pruneSupersededContentReads(messages);
        expect(resultOutput(pruned, 'p1')).toEqual({
            type: 'json',
            value: { result: 'not found', status: 'error' },
        });
        expect(resultValue(pruned, 'p2')).toContain('read again later');
        expect(resultValue(pruned, 'r1')).toBe('v2');
    });

    it('does not let a replayed failed read without a status supersede the earlier good read', () => {
        const messages = [
            ...replayedRead('p1', { type: 'dashboard', slug: 'sales' }, 'v1'),
            toolCall('p2', 'readContent', { type: 'dashboard', slug: 'sales' }),
            toolResult('p2', 'readContent', {
                type: 'json',
                value: 'Error reading dashboard "sales": not found',
            }),
        ];
        const pruned = pruneSupersededContentReads(messages);
        expect(pruned.replacedReads).toBe(0);
        expect(resultValue(pruned.messages, 'p1')).toBe(
            readEnvelope('dashboard', 'v1'),
        );
    });

    it('does not let a backfilled unavailable result supersede the earlier good read', () => {
        const messages = [
            ...replayedRead('p1', { type: 'chart', slug: 'revenue' }, 'v1'),
            toolCall('p2', 'readContent', { type: 'chart', slug: 'revenue' }),
            toolResult('p2', 'readContent', {
                type: 'json',
                value: 'Tool result unavailable.',
            }),
            { role: 'user' as const, content: 'now edit revenue' },
        ];
        const pruned = pruneSupersededContentReads(messages);
        expect(pruned.replacedReads).toBe(0);
        expect(resultValue(pruned.messages, 'p1')).toBe(
            readEnvelope('chart', 'v1'),
        );
    });

    it('reports how many reads were replaced with stubs', () => {
        const messages = [
            ...read('r1', { type: 'dashboard', slug: 'sales' }, 'v1'),
            ...read('r2', { type: 'dashboard', slug: 'sales' }, 'v2'),
            ...read('r3', { type: 'dashboard', slug: 'sales' }, 'v3'),
        ];
        expect(pruneSupersededContentReads(messages).replacedReads).toBe(2);
    });

    it('is stable when applied again to its own output', () => {
        const messages = [
            ...read('r1', { type: 'dashboard', slug: 'sales' }, 'v1'),
            ...read('r2', { type: 'dashboard', slug: 'sales' }, 'v2'),
        ];
        const { messages: once } = pruneSupersededContentReads(messages);
        expect(pruneSupersededContentReads(once).messages).toBe(once);
    });
});
