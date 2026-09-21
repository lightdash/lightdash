import { toolDashboardV2ArgsSchemaPersisted } from '@lightdash/common';
import {
    metricQueryMock,
    validExplore,
} from '../../../../services/ProjectService/ProjectService.mock';
import { AiDecisionClient } from '../decisions/AiDecisionClient';
import { AgentContext } from '../utils/AgentContext';
import { getGenerateDashboardV2 } from './generateDashboardV2';

const visualization = (title: string) => ({
    title,
    description: title,
    chartConfig: null,
    mergeConfig: null,
    queryConfig: {
        ...metricQueryMock,
        sorts: metricQueryMock.sorts.map((sort) => ({
            ...sort,
            nullsFirst: sort.nullsFirst ?? null,
        })),
        customMetrics: null,
        tableCalculations: null,
        filters: null,
        parameters: null,
    },
});
const args = {
    title: 'Overview',
    description: 'Dashboard',
    visualizations: [visualization('Trend'), visualization('Breakdown')],
};
const options = {
    toolCallId: 'dashboard-call',
    messages: [],
    experimental_context: new AgentContext([validExplore]),
};
const setup = (fast = true) => {
    const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async (_url, init) => {
            const { questions } = JSON.parse(String(init?.body));
            return Response.json({
                model: 'test',
                answers: Object.fromEntries(
                    Object.keys(questions).map((key) => {
                        const selected =
                            key === 'template'
                                ? 'stacked'
                                : `tile_${Object.keys(questions).length - 2 - Number(key.split('_')[1])}`;
                        return [
                            key,
                            {
                                type: 'choice',
                                choice: selected,
                                confidence: 0.99,
                                probabilities: { [selected]: 1 },
                            },
                        ];
                    }),
                ),
            });
        });
    const createOrUpdateArtifact = vi.fn().mockResolvedValue({});
    const getPrompt = vi
        .fn()
        .mockResolvedValue({ threadUuid: 'thread-1', promptUuid: 'prompt-1' });
    const tool = getGenerateDashboardV2({
        getPrompt,
        createOrUpdateArtifact,
        decisions: fast
            ? new AiDecisionClient(
                  { apiKey: 'test', model: 'test', timeoutMs: 100 },
                  request,
              )
            : undefined,
        userQuestion: 'Show Breakdown before Trend, in a single column',
    });
    return { tool, request, createOrUpdateArtifact };
};

describe('dashboard artifact layout', () => {
    it('persists generated positions without reordering or changing query configurations', async () => {
        const { tool, request, createOrUpdateArtifact } = setup();
        const original = structuredClone(args);
        expect(await tool.execute!(args, options)).toMatchObject({
            result: expect.stringContaining('Dashboard layout: stacked.'),
            metadata: { status: 'success' },
        });
        const config = createOrUpdateArtifact.mock.calls[0][0].vizConfig;
        expect(
            toolDashboardV2ArgsSchemaPersisted.safeParse(config).success,
        ).toBe(true);
        expect(config.visualizations).toEqual(args.visualizations);
        expect(config.layout.positions[1].y).toBe(0);
        expect(config.layout.positions[0].y).toBeGreaterThan(0);
        expect(args).toEqual(original);
        expect(request).toHaveBeenCalledOnce();
        expect(createOrUpdateArtifact).toHaveBeenCalledOnce();
    });

    it('excludes invalid sources before choosing a layout and supports a usable single-chart artifact', async () => {
        const { tool, request, createOrUpdateArtifact } = setup();
        const input = {
            ...args,
            visualizations: [
                args.visualizations[0],
                {
                    ...args.visualizations[1],
                    title: 'Forbidden secret',
                    queryConfig: {
                        ...args.visualizations[1].queryConfig,
                        exploreName: 'not-authorized',
                    },
                },
            ],
        };
        expect(await tool.execute!(input, options)).toMatchObject({
            metadata: { status: 'success' },
        });
        const config = createOrUpdateArtifact.mock.calls[0][0].vizConfig;
        expect(config.visualizations).toHaveLength(1);
        expect(config.layout.positions).toHaveLength(1);
        expect(
            toolDashboardV2ArgsSchemaPersisted.safeParse(config).success,
        ).toBe(true);
        expect(String(request.mock.calls[0][1]?.body)).not.toContain(
            'Forbidden secret',
        );
    });

    it('does not classify or publish when all source validation fails', async () => {
        const { tool, request, createOrUpdateArtifact } = setup();
        await tool.execute!(args, {
            ...options,
            experimental_context: new AgentContext([]),
        });
        expect(request).not.toHaveBeenCalled();
        expect(createOrUpdateArtifact).not.toHaveBeenCalled();
    });

    it.each([false, true])(
        'preserves generation with decisions disabled or unavailable (%s)',
        async (fast) => {
            const { tool, request, createOrUpdateArtifact } = setup(fast);
            request.mockRejectedValue(new Error('offline'));
            expect(await tool.execute!(args, options)).toMatchObject({
                result: fast
                    ? 'Dashboard uses the default layout. No requested custom arrangement was applied.'
                    : 'Success',
                metadata: { status: 'success' },
            });
            expect(createOrUpdateArtifact.mock.calls[0][0].vizConfig).toEqual(
                args,
            );
            expect(request).toHaveBeenCalledTimes(fast ? 1 : 0);
        },
    );
});
