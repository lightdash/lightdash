import {
    buildAiDashboardLayout,
    type DashboardV2Visualization,
} from '@lightdash/common';
import { AiDecisionClient } from './AiDecisionClient';
import { chooseDashboardLayout } from './dashboardLayout';

const visualizations: DashboardV2Visualization[] = [
    'Detail',
    'Summary',
    'Trend',
].map((title) => ({
    title,
    description: `${title} chart`,
    chartConfig: null,
    mergeConfig: null,
    queryConfig: {
        exploreName: 'orders',
        metrics: ['orders_count'],
        dimensions: title === 'Summary' ? [] : ['orders_status'],
        sorts: [],
        filters: null,
        limit: null,
        customMetrics: null,
        tableCalculations: null,
        parameters: { sensitive: 'not-needed-for-layout' },
    },
}));
const choice = (value: string, confidence = 0.99) => ({
    type: 'choice',
    choice: value,
    confidence,
    probabilities: { [value]: 1 },
});
const setup = (
    answers = {
        template: choice('overview'),
        position_0: choice('tile_1'),
        position_1: choice('tile_2'),
        position_2: choice('tile_0'),
    },
) => {
    const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ model: 'test', answers }));
    return {
        fetcher,
        decisions: new AiDecisionClient(
            { apiKey: 'test', model: 'test', timeoutMs: 100 },
            fetcher,
        ),
    };
};

describe('dashboard layout decisions', () => {
    it('batches closed ordering and template choices without sending query values', async () => {
        const { decisions, fetcher } = setup();
        const original = structuredClone(visualizations);
        const result = await chooseDashboardLayout({
            decisions,
            question: 'KPIs first, then trend, then details',
            visualizations,
        });
        expect(result).toEqual(
            buildAiDashboardLayout(
                'overview',
                [
                    { summary: false, detailed: false },
                    { summary: true, detailed: false },
                    { summary: false, detailed: false },
                ],
                [1, 2, 0],
            ),
        );
        expect(visualizations).toEqual(original);
        expect(fetcher).toHaveBeenCalledOnce();
        const body = String(fetcher.mock.calls[0][1]?.body);
        expect(body).not.toContain('not-needed-for-layout');
        expect(Object.keys(JSON.parse(body).questions)).toHaveLength(4);
    });

    it.each(
        [
            ['tile_1', 'tile_1', 'tile_0'],
            ['tile_1', 'none', 'tile_0'],
        ].map((order) => ({ order })),
    )(
        'retains the full original order when choices are incomplete: %j',
        async ({ order }) => {
            const { decisions } = setup({
                template: choice('balanced'),
                position_0: choice(order[0]),
                position_1: choice(order[1]),
                position_2: choice(order[2]),
            });
            const result = await chooseDashboardLayout({
                decisions,
                question: 'Dashboard',
                visualizations,
            });
            expect(
                result?.positions.map((position) => [position.x, position.y]),
            ).toEqual([
                [0, 0],
                [18, 0],
                [0, 8],
            ]);
        },
    );

    it('retains ordering when one position is uncertain', async () => {
        const { decisions } = setup({
            template: choice('balanced'),
            position_0: choice('tile_1', 0.7),
            position_1: choice('tile_2'),
            position_2: choice('tile_0'),
        });
        expect(
            (
                await chooseDashboardLayout({
                    decisions,
                    question: 'Dashboard',
                    visualizations,
                })
            )?.positions[0],
        ).toMatchObject({ x: 0, y: 0 });
    });

    it.each(['none', 'invented'])(
        'falls back for an unsupported template %s',
        async (template) => {
            const { decisions } = setup({
                template: choice(template),
                position_0: choice('tile_1'),
                position_1: choice('tile_2'),
                position_2: choice('tile_0'),
            });
            expect(
                await chooseDashboardLayout({
                    decisions,
                    question: 'Dashboard',
                    visualizations,
                }),
            ).toBeUndefined();
        },
    );

    it('falls back on outage and skips oversized requests', async () => {
        const { decisions, fetcher } = setup();
        fetcher.mockRejectedValue(new Error('offline'));
        expect(
            await chooseDashboardLayout({
                decisions,
                question: 'Dashboard',
                visualizations,
            }),
        ).toBeUndefined();
        expect(
            await chooseDashboardLayout({
                decisions,
                question: 'x'.repeat(8_001),
                visualizations,
            }),
        ).toBeUndefined();
        expect(fetcher).toHaveBeenCalledOnce();
    });
});
