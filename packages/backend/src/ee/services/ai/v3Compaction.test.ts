import { type AiAgentV3TokenUsage } from '@lightdash/common';
import { expect, it } from 'vitest';
import { type AiCanonicalMessage } from '../../database/entities/aiAgentV3';
import {
    buildV3CompactionInput,
    getLatestTerminalV3Assistant,
    getV3AssistantContextTokens,
    getV3CompactionTrigger,
    mergeV3CompactionPreservedContext,
    resolveV3CompactionContextWindow,
    selectV3CompactionContext,
    serializeV3Conversation,
} from './v3Compaction';

const metadata: AiCanonicalMessage['metadata'] = {
    createdAt: '2026-01-01T00:00:00.000Z',
    createdByUserUuid: null,
    status: null,
    lastHeartbeatAt: null,
    modelConfig: null,
    tokenUsage: null,
    error: null,
    hidden: false,
    context: [],
    annotations: [],
    slack: null,
    legacy: null,
};

const message = (
    uuid: string,
    role: AiCanonicalMessage['role'],
    parts: AiCanonicalMessage['parts'],
    metadataOverrides: Partial<AiCanonicalMessage['metadata']> = {},
): AiCanonicalMessage => ({
    uuid,
    role,
    parts,
    metadata: { ...metadata, ...metadataOverrides },
});

it('selects only rows after the latest compaction', () => {
    const first = message('first', 'user', []);
    const oldCompaction = message('old', 'compaction', [
        {
            uuid: 'old-part',
            type: 'compaction',
            payloadVersion: 1,
            payload: { summary: 'old summary', serializedInput: 'old input' },
            toolCallId: null,
            artifactVersionUuid: null,
        },
    ]);
    const skipped = message('skipped', 'assistant', []);
    const latestCompaction = message('latest', 'compaction', [
        {
            uuid: 'latest-part',
            type: 'compaction',
            payloadVersion: 1,
            payload: {
                summary: 'latest summary',
                serializedInput: 'latest input',
                preservedContext: {
                    artifacts: ['Old chart (chart-v1)'],
                    pinnedContext: ['dashboard Revenue (dashboard-v1)'],
                },
            },
            toolCallId: null,
            artifactVersionUuid: null,
        },
    ]);
    const tail = message('tail', 'assistant', []);

    expect(
        selectV3CompactionContext([
            first,
            oldCompaction,
            skipped,
            latestCompaction,
            tail,
        ]),
    ).toEqual({
        previousSummary: 'latest summary',
        previousPreservedContext: {
            artifacts: ['Old chart (chart-v1)'],
            pinnedContext: ['dashboard Revenue (dashboard-v1)'],
        },
        messagesToCompact: [tail],
    });
});

it('does not compact an in-progress assistant turn', () => {
    const completed = message('completed', 'assistant', [], {
        status: 'completed',
    });
    const active = message('active', 'assistant', [], {
        status: 'in_progress',
    });

    expect(getLatestTerminalV3Assistant([completed, active])).toBeNull();
    expect(getLatestTerminalV3Assistant([completed])).toBe(completed);
    expect(getLatestTerminalV3Assistant([active])).toBeNull();
});

it('builds split initial and update prompts around exact serialized input', () => {
    const conversation = serializeV3Conversation([
        message('user', 'user', [
            {
                uuid: 'user-text',
                type: 'text',
                payloadVersion: 1,
                payload: { text: 'Use explore orders' },
                toolCallId: null,
                artifactVersionUuid: null,
            },
        ]),
        message('assistant', 'assistant', [
            {
                uuid: 'tool',
                type: 'tool',
                payloadVersion: 1,
                payload: {
                    state: 'output-available',
                    toolName: 'runSql',
                    input: { sql: 'SELECT orders.total_revenue' },
                    output: { rows: [{ total_revenue: 42 }] },
                },
                toolCallId: 'call-1',
                artifactVersionUuid: null,
            },
        ]),
    ]);
    const initial = buildV3CompactionInput({
        conversation,
        previousSummary: null,
    });
    const update = buildV3CompactionInput({
        conversation,
        previousSummary: 'Keep filter value enterprise',
    });

    expect(initial).toContain('<conversation>');
    expect(initial).toContain('SELECT orders.total_revenue');
    expect(initial).toContain('Preserve exact explore names');
    expect(initial).toContain('metric and dimension names');
    expect(initial).toContain('chart and dashboard UUIDs');
    expect(initial).not.toContain('<previous-summary>');
    expect(update).toContain(
        '<previous-summary>\nKeep filter value enterprise\n</previous-summary>',
    );
    expect(update).toContain('PRESERVE all existing information');
});

it('caps serialized tool results at 2000 characters', () => {
    const serialized = serializeV3Conversation([
        message('assistant', 'assistant', [
            {
                uuid: 'tool',
                type: 'tool',
                payloadVersion: 1,
                payload: {
                    state: 'output-available',
                    toolName: 'runSql',
                    input: { sql: 'SELECT 1' },
                    output: 'x'.repeat(2100),
                },
                toolCallId: 'call-1',
                artifactVersionUuid: null,
            },
        ]),
    ]);

    expect(serialized).toContain('...[truncated 102 chars]');
    expect(serialized).not.toContain('x'.repeat(2001));
});

it('carries deterministic artifacts and pinned context across compactions', () => {
    const preserved = mergeV3CompactionPreservedContext(
        {
            artifacts: ['Existing chart (chart-v1)'],
            pinnedContext: ['dashboard Existing (dashboard-v1)'],
        },
        [
            message('user', 'user', [], {
                context: [
                    {
                        uuid: 'context-v2',
                        entityType: 'chart',
                        entityUuid: 'chart-v2',
                        entityRef: null,
                        pinnedVersionUuid: 'chart-version-v2',
                        displayName: 'New chart',
                        createdAt: '2026-01-01T00:00:00.000Z',
                        runtimeOverrides: null,
                    },
                ],
            }),
            message('assistant', 'assistant', [
                {
                    uuid: 'artifact-part',
                    type: 'artifact',
                    payloadVersion: 1,
                    payload: { title: 'New dashboard' },
                    toolCallId: null,
                    artifactVersionUuid: 'dashboard-v2',
                },
            ]),
        ],
    );

    expect(preserved).toEqual({
        artifacts: [
            'Existing chart (chart-v1)',
            'New dashboard (dashboard-v2)',
        ],
        pinnedContext: [
            'dashboard Existing (dashboard-v1)',
            'chart New chart (chart-version-v2)',
        ],
    });
});

it('accepts only a valid context-window override above the reserve', () => {
    expect(resolveV3CompactionContextWindow(200000, 20000)).toBe(20000);
    expect(resolveV3CompactionContextWindow(200000, 16000)).toBe(200000);
    expect(resolveV3CompactionContextWindow(200000, null)).toBe(200000);
});

const usage = (
    overrides: Partial<AiAgentV3TokenUsage>,
): AiAgentV3TokenUsage => ({
    version: 2,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    reasoningTokens: null,
    cachedInputTokens: null,
    contextTokens: null,
    ...overrides,
});

it('triggers strictly above the threshold using the latest assistant context', () => {
    const assistantAtThreshold = message('threshold', 'assistant', [], {
        tokenUsage: usage({
            inputTokens: 180,
            outputTokens: 20,
            totalTokens: 200,
            contextTokens: 200,
        }),
    });
    const assistantAboveThreshold = message('above', 'assistant', [], {
        tokenUsage: usage({
            inputTokens: 181,
            outputTokens: 20,
            totalTokens: 201,
            contextTokens: 201,
        }),
    });

    expect(
        getV3CompactionTrigger({
            latestAssistant: assistantAtThreshold,
            supportsCompaction: true,
            contextWindowTokens: 16584,
        }),
    ).toBeNull();
    expect(
        getV3CompactionTrigger({
            latestAssistant: assistantAboveThreshold,
            supportsCompaction: true,
            contextWindowTokens: 16584,
        }),
    ).toBe('threshold');
    expect(
        getV3CompactionTrigger({
            latestAssistant: assistantAboveThreshold,
            supportsCompaction: false,
            contextWindowTokens: 16584,
        }),
    ).toBeNull();
});

it('does not trigger on a fresh thread', () => {
    const fresh = message('fresh', 'assistant', [], {
        tokenUsage: usage({
            inputTokens: 9_737,
            outputTokens: 694,
            totalTokens: 10_431,
            contextTokens: 10_431,
        }),
    });

    expect(
        getV3CompactionTrigger({
            latestAssistant: fresh,
            supportsCompaction: true,
            contextWindowTokens: 200_000,
        }),
    ).toBeNull();
});

it('does not trigger on a heavily cached anthropic run whose billed total exceeds the window', () => {
    // 24 tool-loop steps, each re-reading the same ~9.5k cached prompt: the
    // billed total blows past 200k while only ~10k is resident.
    const cachedRun = message('cached', 'assistant', [], {
        tokenUsage: usage({
            inputTokens: 228_000,
            outputTokens: 1_371,
            totalTokens: 229_371,
            cachedInputTokens: 218_000,
            contextTokens: 10_431,
        }),
    });

    expect(
        getV3CompactionTrigger({
            latestAssistant: cachedRun,
            supportsCompaction: true,
            contextWindowTokens: 200_000,
        }),
    ).toBeNull();
});

it('triggers when the resident context genuinely approaches the window', () => {
    const nearlyFull = message('full', 'assistant', [], {
        tokenUsage: usage({
            inputTokens: 186_000,
            outputTokens: 900,
            totalTokens: 186_900,
            cachedInputTokens: 180_000,
            contextTokens: 186_900,
        }),
    });

    expect(
        getV3CompactionTrigger({
            latestAssistant: nearlyFull,
            supportsCompaction: true,
            contextWindowTokens: 200_000,
        }),
    ).toBe('threshold');
});

it('applies the same threshold to an openai run with no cache reads', () => {
    const openaiUnder = message('openai-under', 'assistant', [], {
        tokenUsage: usage({
            inputTokens: 19_873,
            outputTokens: 500,
            totalTokens: 20_373,
            cachedInputTokens: 0,
            contextTokens: 20_373,
        }),
    });
    const openaiOver = message('openai-over', 'assistant', [], {
        tokenUsage: usage({
            inputTokens: 260_000,
            outputTokens: 800,
            totalTokens: 260_800,
            cachedInputTokens: 0,
            contextTokens: 260_800,
        }),
    });

    expect(
        getV3CompactionTrigger({
            latestAssistant: openaiUnder,
            supportsCompaction: true,
            contextWindowTokens: 272_000,
        }),
    ).toBeNull();
    expect(
        getV3CompactionTrigger({
            latestAssistant: openaiOver,
            supportsCompaction: true,
            contextWindowTokens: 272_000,
        }),
    ).toBe('threshold');
});

it('never threshold-compacts a legacy envelope that predates contextTokens', () => {
    const legacy = message('legacy', 'assistant', [], {
        tokenUsage: {
            version: 1,
            inputTokens: 228_000,
            outputTokens: 1_371,
            totalTokens: 229_371,
            reasoningTokens: null,
            cachedInputTokens: 218_000,
        } as AiAgentV3TokenUsage,
    });

    expect(getV3AssistantContextTokens(legacy)).toBeNull();
    expect(
        getV3CompactionTrigger({
            latestAssistant: legacy,
            supportsCompaction: true,
            contextWindowTokens: 200_000,
        }),
    ).toBeNull();
});

it('heals a context overflow even when token usage is absent', () => {
    const overflow = message('overflow', 'assistant', [], {
        error: {
            version: 1,
            name: 'context_overflow',
            message: 'maximum context window exceeded',
            data: null,
        },
        tokenUsage: null,
    });

    expect(
        getV3CompactionTrigger({
            latestAssistant: overflow,
            supportsCompaction: false,
            contextWindowTokens: null,
        }),
    ).toBe('context_overflow');
});
