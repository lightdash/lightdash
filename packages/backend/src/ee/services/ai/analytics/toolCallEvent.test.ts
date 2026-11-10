import { WarehouseQueryError } from '@lightdash/common';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { toolErrorOutput } from '../utils/toolErrorHandler';
import type { IsMetadataOnly } from './metadataOnly';
import {
    aiAgentToolCallCompletedPropertiesSchema,
    createToolCallEventTracker,
    type AiAgentToolCallCompletedProperties,
    type ToolCallEventInput,
} from './toolCallEvent';

const CANARY = 'CANARY_7f3a';

const context = {
    organizationId: '00000000-0000-4000-8000-000000000001',
    projectId: '00000000-0000-4000-8000-000000000002',
    aiAgentId: '00000000-0000-4000-8000-000000000003',
    threadId: '00000000-0000-4000-8000-000000000004',
    promptId: '00000000-0000-4000-8000-000000000005',
    model: 'claude-sonnet-4-5',
    serverVersion: '3.195.1',
};

const call = (
    overrides: Partial<Omit<ToolCallEventInput, 'attempt'>>,
): Omit<ToolCallEventInput, 'attempt'> => ({
    toolCallId: 'toolu_01',
    toolName: 'runComposerQueries',
    result: {
        type: 'tool-result',
        output: { metadata: { status: 'success' } },
    },
    stepIndex: 0,
    durationMs: 120,
    stage: 'query',
    queryCacheHit: false,
    queryReuseHit: false,
    ...overrides,
});

describe('tool call event privacy', () => {
    it('never emits tool output or error text', () => {
        const emitted: AiAgentToolCallCompletedProperties[] = [];
        const tracker = createToolCallEventTracker(context, (properties) =>
            emitted.push(properties),
        );

        tracker.track(
            call({
                result: {
                    type: 'tool-result',
                    output: toolErrorOutput(
                        new WarehouseQueryError(`Binder Error: ${CANARY}`),
                        `Error running ${CANARY}.`,
                        { captureToSentry: false },
                    ),
                },
            }),
        );
        tracker.track(
            call({
                toolCallId: 'call_grep',
                toolName: 'grepFields',
                result: {
                    type: 'tool-result',
                    output: {
                        result: `Found ${CANARY}`,
                        metadata: { status: 'success', rowCount: 3 },
                        structuredContent: { matches: [CANARY] },
                    },
                },
            }),
        );
        tracker.track(
            call({
                toolCallId: 'call_search',
                toolName: 'searchFieldValues',
                result: { type: 'tool-error', error: new Error(CANARY) },
            }),
        );

        expect(emitted).toHaveLength(3);
        expect(JSON.stringify(emitted)).not.toContain(CANARY);
        expect(emitted.map(({ status }) => status)).toEqual([
            'error',
            'success',
            'error',
        ]);
    });

    it('rejects any field outside the metadata allowlist', () => {
        const valid = aiAgentToolCallCompletedPropertiesSchema.parse({
            ...context,
            toolCallId: 'toolu_01',
            toolName: 'runComposerQueries',
            stepIndex: 0,
            durationMs: 1,
            stage: 'query',
            queryCacheHit: null,
            queryReuseHit: null,
            status: 'success',
            attempt: 1,
        });
        const accepts = (overrides: Record<string, unknown>) =>
            aiAgentToolCallCompletedPropertiesSchema.safeParse({
                ...valid,
                ...overrides,
            }).success;

        expect(accepts({ errorMessage: CANARY })).toBe(false);
        expect(accepts({ promptId: CANARY })).toBe(false);
        expect(accepts({ toolName: `${CANARY} with spaces` })).toBe(false);
        expect(accepts({ model: `${CANARY} with spaces` })).toBe(false);
    });

    it('types the payload as ids, enums, numbers and booleans only', () => {
        expectTypeOf<
            IsMetadataOnly<AiAgentToolCallCompletedProperties>
        >().toEqualTypeOf<true>();
        expectTypeOf<IsMetadataOnly<{ note: string }>>().toEqualTypeOf<false>();
        expectTypeOf<
            IsMetadataOnly<{ terms: string[] }>
        >().toEqualTypeOf<false>();
    });
});

describe('createToolCallEventTracker', () => {
    it('numbers attempts per tool in the order calls start', () => {
        const emitted: AiAgentToolCallCompletedProperties[] = [];
        const tracker = createToolCallEventTracker(context, (properties) =>
            emitted.push(properties),
        );
        tracker.start('a', 'runComposerQueries');
        tracker.start('b', 'runComposerQueries');
        tracker.track(call({ toolCallId: 'b' }));
        tracker.track(call({ toolCallId: 'g', toolName: 'grepFields' }));
        tracker.track(call({ toolCallId: 'a' }));
        expect(
            emitted.map(({ toolCallId, attempt }) => [toolCallId, attempt]),
        ).toEqual([
            ['b', 2],
            ['g', 1],
            ['a', 1],
        ]);
    });

    it('emits each tool call once', () => {
        const emitted: AiAgentToolCallCompletedProperties[] = [];
        const tracker = createToolCallEventTracker(context, (properties) =>
            emitted.push(properties),
        );
        tracker.track(call({}));
        tracker.track(call({}));
        expect(emitted).toHaveLength(1);
        expect(tracker.isTracked('toolu_01')).toBe(true);
    });
});
