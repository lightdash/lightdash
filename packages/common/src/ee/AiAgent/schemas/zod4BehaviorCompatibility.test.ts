import { toolCreateContentArgsSchema } from './tools/toolCreateContentArgs';
import { toolDiscoverFieldsOutputSchema } from './tools/toolDiscoverFieldsArgs';
import { mcpRenderChartResultSchema } from './tools/toolQueryResultSchemas';

describe('Zod 4 behavior compatibility', () => {
    test('unknown-valued object fields remain optional', () => {
        expect(
            toolCreateContentArgsSchema.safeParse({
                type: 'chart',
                content: {
                    slug: 'orders',
                    name: 'Orders',
                    description: null,
                    spaceSlug: 'analytics',
                    version: 1,
                    contentType: 'chart',
                    verified: false,
                    tableName: 'orders',
                    metricQuery: {
                        dimensions: [],
                        metrics: [],
                        sorts: [],
                        tableCalculations: [],
                    },
                    dashboardSlug: '',
                },
            }).success,
        ).toBe(true);

        expect(
            toolDiscoverFieldsOutputSchema.safeParse({
                result: '',
                metadata: { status: 'streaming' },
            }).success,
        ).toBe(true);

        expect(
            mcpRenderChartResultSchema.safeParse({
                status: 'done',
                queryUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
                exploreUrl: null,
            }).success,
        ).toBe(true);
    });
});
