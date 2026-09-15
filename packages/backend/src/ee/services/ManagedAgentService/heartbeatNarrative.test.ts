import {
    ManagedAgentActionType,
    ManagedAgentTargetType,
} from '@lightdash/common';
import { MockLanguageModelV3 } from 'ai/test';
import { getAiCallTelemetry } from '../ai/utils/aiCallTelemetry';
import {
    composeHeartbeatNarrative,
    formatHeartbeatEvidence,
    tidyNarrative,
} from './heartbeatNarrative';

const telemetry = getAiCallTelemetry({
    functionId: 'test',
    feature: 'managed-agent',
    keyManagement: null,
});

const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
};

type DoGenerateOptions = Parameters<MockLanguageModelV3['doGenerate']>[0];

const buildModel = (reply: () => string) => {
    const calls: DoGenerateOptions[] = [];
    const model = new MockLanguageModelV3({
        modelId: 'mock-report-model',
        doGenerate: async (options) => {
            calls.push(options);
            return {
                content: [{ type: 'text', text: reply() }],
                finishReason: { unified: 'stop', raw: undefined },
                usage,
                warnings: [],
            };
        },
    });
    return { model, calls };
};

const staleFlag = {
    actionType: ManagedAgentActionType.FLAGGED_STALE,
    targetType: ManagedAgentTargetType.CHART,
    targetName: 'Old revenue',
    description: 'Last viewed 200 days ago.',
    reversedAt: null,
};

const evidence = [
    {
        toolName: 'get_popular_content',
        input: { limit: 5 },
        output: '[{"name":"Revenue by week","views":2200}]',
    },
];

describe('formatHeartbeatEvidence', () => {
    it('caps each result and says when results were left out', () => {
        const text = formatHeartbeatEvidence(
            Array.from({ length: 12 }, (_, index) => ({
                toolName: `get_tool_${index}`,
                input: {},
                output: 'x'.repeat(20_000),
            })),
        );
        expect(text).toContain('### get_tool_0 {}');
        expect(text).toContain('(truncated)');
        expect(text).toContain('more tool results omitted for length');
        expect(text.length).toBeLessThan(130_000);
    });

    it('says when nothing was recorded', () => {
        expect(formatHeartbeatEvidence([])).toBe(
            'No tool results were recorded.',
        );
    });
});

describe('tidyNarrative', () => {
    it('replaces dashes and gives segment names their own paragraph', () => {
        expect(
            tidyNarrative(
                '**Jaffle shop — agent update**\nA story – with dashes.\n\n🧹 **The Sweep**\n2 charts flagged.\n\n**By hand**\n\nkept',
            ),
        ).toBe(
            '**Jaffle shop - agent update**\n\nA story - with dashes.\n\n🧹 **The Sweep**\n\n2 charts flagged.\n\n**By hand**\n\nkept',
        );
    });
});

describe('composeHeartbeatNarrative', () => {
    it('writes from the evidence with the brief and limits claims to saved actions', async () => {
        const { model, calls } = buildModel(
            () => '  **Jaffle shop: agent update**\n\nA grounded story.  ',
        );
        const text = await composeHeartbeatNarrative({
            model,
            callOptions: {},
            providerOptions: undefined,
            telemetry,
            projectName: 'Jaffle shop',
            evidence,
            notice: 'Cleanup mode is observe.',
            actions: [staleFlag],
            onFailure: vi.fn(),
        });

        expect(text).toBe('**Jaffle shop: agent update**\n\nA grounded story.');
        expect(calls).toHaveLength(1);
        expect(calls[0].tools).toBeUndefined();
        const [system, request] = calls[0].prompt;
        expect(system.role).toBe('system');
        const systemText = JSON.stringify(system.content);
        expect(systemText).toContain('Storytelling Over Stats');
        expect(systemText).not.toContain('## Output Format');
        expect(systemText).toContain(
            'only if it appears in the saved actions list',
        );
        const requestText = JSON.stringify(request.content);
        expect(requestText).toContain('flagged_stale on chart');
        expect(requestText).toContain('Last viewed 200 days ago.');
        expect(requestText).toContain('get_popular_content');
        expect(requestText).toContain('Cleanup mode is observe.');
    });

    it('tells the writer when the run changed nothing', async () => {
        const { model, calls } = buildModel(() => 'Quiet week.');
        await composeHeartbeatNarrative({
            model,
            callOptions: {},
            providerOptions: undefined,
            telemetry,
            projectName: 'Jaffle shop',
            evidence: [],
            notice: null,
            actions: [],
            onFailure: vi.fn(),
        });
        expect(JSON.stringify(calls[0].prompt)).toContain(
            'None. This run changed nothing.',
        );
    });

    it('returns null so the caller falls back when the provider fails or says nothing', async () => {
        const failing = new MockLanguageModelV3({
            modelId: 'mock-report-model',
            doGenerate: async () => {
                throw new Error('Provider disconnected');
            },
        });
        const onFailure = vi.fn();
        const args = {
            callOptions: { maxRetries: 0 },
            providerOptions: undefined,
            telemetry,
            projectName: 'Jaffle shop',
            evidence,
            notice: null,
            actions: [staleFlag],
            onFailure,
        };
        await expect(
            composeHeartbeatNarrative({ ...args, model: failing }),
        ).resolves.toBeNull();
        expect(onFailure).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Provider disconnected' }),
        );
        const { model: empty } = buildModel(() => '   ');
        await expect(
            composeHeartbeatNarrative({ ...args, model: empty }),
        ).resolves.toBeNull();
        expect(onFailure).toHaveBeenCalledTimes(1);
    });
});
