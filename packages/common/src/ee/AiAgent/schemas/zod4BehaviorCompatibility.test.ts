import { toolCreateContentArgsSchema } from './tools/toolCreateContentArgs';
import { toolCreateScheduledDeliveryArgsSchema } from './tools/toolCreateScheduledDeliveryArgs';
import { toolDiscoverFieldsOutputSchema } from './tools/toolDiscoverFieldsArgs';
import { toolGetQueryResultArgsSchema } from './tools/toolGetQueryResultArgs';
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

    test('coerced tool inputs remain required', () => {
        const content = {
            slug: 'orders',
            name: 'Orders',
            description: null,
            spaceSlug: 'analytics',
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
        };

        expect(
            toolCreateContentArgsSchema.safeParse({
                type: 'chart',
                content,
            }).success,
        ).toBe(false);
        expect(
            toolCreateContentArgsSchema.safeParse({
                type: 'chart',
                content: { ...content, version: 1 },
            }).success,
        ).toBe(true);
    });

    test('rejects UUIDs and integers that are unsafe in Zod 4', () => {
        expect(
            toolGetQueryResultArgsSchema.safeParse({
                queryUuid: '3675b69e-8324-0110-bdca-059031aa8da3',
            }).success,
        ).toBe(false);
        expect(
            toolGetQueryResultArgsSchema.safeParse({
                queryUuid: '3675b69e-8324-4110-bdca-059031aa8da3',
            }).success,
        ).toBe(true);

        const delivery = {
            resourceType: 'chart',
            resourceUuidOrSlug: 'orders',
            name: 'Orders',
            cron: '0 9 * * 1',
            timezone: null,
            format: 'csv',
            message: null,
            targets: [{ type: 'email', recipient: 'a@b.com' }],
            enabled: false,
            aiAugmentationPrompt: null,
        } as const;

        expect(
            toolCreateScheduledDeliveryArgsSchema.safeParse({
                ...delivery,
                csvOptions: {
                    formatted: true,
                    limit: Number.MAX_SAFE_INTEGER + 1,
                },
            }).success,
        ).toBe(false);
        expect(
            toolCreateScheduledDeliveryArgsSchema.safeParse({
                ...delivery,
                csvOptions: { formatted: true, limit: 1000 },
            }).success,
        ).toBe(true);
    });
});
