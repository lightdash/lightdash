// Stub the e2b/ai SDKs before importing AppGenerateService so this unit test
// never reaches a real sandbox or model client.
import { type Explore } from '@lightdash/common';
import { parse as parseYaml } from 'yaml';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

type PrivateAppGenerateService = {
    exploresToYaml: (explores: Explore[]) => {
        yaml: string;
        tableCount: number;
        dimensionCount: number;
        metricCount: number;
    };
};

const exploresToYaml = (explores: Explore[]) =>
    (AppGenerateService as unknown as PrivateAppGenerateService).exploresToYaml(
        explores,
    );

describe('AppGenerateService.exploresToYaml', () => {
    it('includes effective AI hints for visible metrics and dimensions', () => {
        const explore = {
            name: 'orders',
            baseTable: 'orders',
            joinedTables: [
                {
                    table: 'customers',
                    sqlOn: '${orders.customer_id} = ${customers.id}',
                },
            ],
            tables: {
                orders: {
                    metrics: {
                        total_revenue: {
                            name: 'total_revenue',
                            type: 'sum',
                            label: 'Total revenue',
                            description: 'Recognized revenue',
                            aiHint: [
                                'Use for recognized revenue questions.',
                                'Shared finance guidance.',
                            ],
                            groups: ['finance'],
                        },
                        order_count: {
                            name: 'order_count',
                            type: 'count',
                        },
                        hidden_metric: {
                            name: 'hidden_metric',
                            type: 'sum',
                            hidden: true,
                            aiHint: ['Do not expose this.'],
                        },
                    },
                    dimensions: {
                        status: {
                            name: 'status',
                            type: 'string',
                            aiHint: 'Prefer "status" over legacy_status.\nKeep \\ values intact.',
                        },
                    },
                    groupDetails: {
                        finance: {
                            label: 'Finance',
                            aiHint: [
                                'Shared finance guidance.',
                                'Use finance-approved fields.',
                            ],
                        },
                    },
                },
                customers: {
                    metrics: {},
                    dimensions: {
                        customer_name: {
                            name: 'customer_name',
                            type: 'string',
                            aiHint: ['Use as the display name.'],
                        },
                    },
                },
            },
        } as unknown as Explore;

        const result = exploresToYaml([explore]);
        const parsed = parseYaml(result.yaml) as {
            models: Array<{
                name: string;
                meta?: {
                    metrics?: Record<string, { ai_hints?: string[] }>;
                };
                columns?: Array<{ name: string; ai_hints?: string[] }>;
            }>;
        };
        const orders = parsed.models.find((model) => model.name === 'orders');
        const customers = parsed.models.find(
            (model) => model.name === 'customers',
        );

        expect(orders).toBeDefined();
        expect(customers).toBeDefined();
        expect(orders?.meta?.metrics?.total_revenue.ai_hints).toEqual([
            'Use for recognized revenue questions.',
            'Shared finance guidance.',
            'Use finance-approved fields.',
        ]);
        expect(orders?.meta?.metrics?.order_count).not.toHaveProperty(
            'ai_hints',
        );
        expect(orders?.meta?.metrics).not.toHaveProperty('hidden_metric');
        expect(
            orders?.columns?.find((column) => column.name === 'status')
                ?.ai_hints,
        ).toEqual([
            'Prefer "status" over legacy_status. Keep \\ values intact.',
        ]);
        expect(
            customers?.columns?.find(
                (column) => column.name === 'customer_name',
            )?.ai_hints,
        ).toEqual(['Use as the display name.']);
        expect(result).toMatchObject({
            tableCount: 2,
            dimensionCount: 2,
            metricCount: 2,
        });
    });
});
