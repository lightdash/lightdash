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

type ModelFile = { filename: string; contents: string };

type PrivateAppGenerateService = {
    exploresToModelFiles: (
        explores: Explore[],
        chartUsageByTable: Map<string, number>,
    ) => {
        files: ModelFile[];
        tableCount: number;
        dimensionCount: number;
        metricCount: number;
        totalBytes: number;
    };
};

const exploresToModelFiles = (
    explores: Explore[],
    chartUsageByTable: Map<string, number> = new Map(),
) =>
    (
        AppGenerateService as unknown as PrivateAppGenerateService
    ).exploresToModelFiles(explores, chartUsageByTable);

const indexOf = (files: ModelFile[]) =>
    files.find((file) => file.filename === '_index.md')!.contents;

const modelFilesOf = (files: ModelFile[]) =>
    files.filter(
        (file) =>
            file.filename !== '_index.md' && file.filename !== 'schema.yml',
    );

const buildExplore = (
    name: string,
    dimensionCount: number,
    options: { descriptionLength?: number } = {},
): Explore =>
    ({
        name,
        baseTable: name,
        joinedTables: [],
        tables: {
            [name]: {
                description: options.descriptionLength
                    ? 'd'.repeat(options.descriptionLength)
                    : undefined,
                metrics: {
                    row_count: { name: 'row_count', type: 'count' },
                },
                dimensions: Object.fromEntries(
                    Array.from({ length: dimensionCount }, (_, i) => [
                        `dim_${i}`,
                        {
                            name: `dim_${i}`,
                            type: 'string',
                            description: 'x'.repeat(180),
                        },
                    ]),
                ),
            },
        },
    }) as unknown as Explore;

describe('AppGenerateService.exploresToModelFiles', () => {
    it('writes one parseable file per model plus an index naming each file', () => {
        const explore = {
            name: 'orders',
            baseTable: 'orders',
            joinedTables: [
                {
                    table: 'customers',
                    sqlOn: '${orders.customer_id} = ${customers.id}',
                    relationship: 'many-to-one',
                },
            ],
            tables: {
                orders: {
                    description: 'One row per order',
                    metrics: {
                        total_revenue: { name: 'total_revenue', type: 'sum' },
                    },
                    dimensions: {
                        status: { name: 'status', type: 'string' },
                    },
                },
                customers: {
                    metrics: {},
                    dimensions: {
                        customer_name: {
                            name: 'customer_name',
                            type: 'string',
                        },
                    },
                },
            },
        } as unknown as Explore;

        const result = exploresToModelFiles([explore]);

        expect(result).toMatchObject({
            tableCount: 2,
            dimensionCount: 2,
            metricCount: 1,
        });
        expect(result.files.map((file) => file.filename).sort()).toEqual([
            '_index.md',
            'customers.yml',
            'orders.yml',
            'schema.yml',
        ]);

        const orders = parseYaml(
            result.files.find((file) => file.filename === 'orders.yml')!
                .contents,
        ) as {
            models: Array<{
                name: string;
                meta?: {
                    metrics?: Record<string, unknown>;
                    joins?: Array<{ join: string }>;
                };
                columns?: Array<{ name: string }>;
            }>;
        };
        expect(orders.models).toHaveLength(1);
        expect(orders.models[0].name).toBe('orders');
        expect(orders.models[0].meta?.metrics).toHaveProperty('total_revenue');
        expect(orders.models[0].meta?.joins?.[0].join).toBe('customers');
        expect(orders.models[0].columns?.[0].name).toBe('status');

        const index = indexOf(result.files);
        expect(index).toContain(
            'orders  orders.yml  dims=1 metrics=1  joins=customers  One row per order',
        );
        expect(index).toContain('customers  customers.yml  dims=1 metrics=0');
    });

    it('orders the index by chart usage so detail is shed from the least-queried models', () => {
        const explores = [
            buildExplore('rarely_used', 1),
            buildExplore('heavily_used', 1),
        ];

        const index = indexOf(
            exploresToModelFiles(
                explores,
                new Map([
                    ['rarely_used', 2],
                    ['heavily_used', 900],
                ]),
            ).files,
        );

        expect(index.indexOf('heavily_used')).toBeLessThan(
            index.indexOf('rarely_used'),
        );
    });

    it('keeps every file under the size the agent Read tool accepts', () => {
        // One model far wider than the per-file ceiling, forcing a split.
        const result = exploresToModelFiles([buildExplore('wide', 2_000)]);

        const modelFiles = modelFilesOf(result.files);
        expect(modelFiles.length).toBeGreaterThan(1);
        for (const file of result.files) {
            expect(Buffer.byteLength(file.contents)).toBeLessThan(256_000);
        }

        const dimensionNames = modelFiles.flatMap((file) => {
            const parsed = parseYaml(file.contents) as {
                models: Array<{
                    name: string;
                    columns?: Array<{ name: string }>;
                }>;
            };
            expect(parsed.models[0].name).toBe('wide');
            return (parsed.models[0].columns ?? []).map(
                (column) => column.name,
            );
        });
        expect(new Set(dimensionNames).size).toBe(2_000);

        expect(modelFiles[0].contents).toContain(
            `# wide continues in ${modelFiles[1].filename}`,
        );
        expect(indexOf(result.files)).toContain('wide  wide.yml');
    });

    it('writes a file for every model the index names, including unsplittable ones', () => {
        // Metrics-only and far past the per-file ceiling: there is no column
        // list to split on, so the model has to be written whole rather than
        // dropped.
        const explore = {
            name: 'metrics_only',
            baseTable: 'metrics_only',
            joinedTables: [],
            tables: {
                metrics_only: {
                    metrics: Object.fromEntries(
                        Array.from({ length: 3_000 }, (_, i) => [
                            `metric_${i}`,
                            {
                                name: `metric_${i}`,
                                type: 'sum',
                                description: 'y'.repeat(180),
                            },
                        ]),
                    ),
                    dimensions: {},
                },
            },
        } as unknown as Explore;

        const result = exploresToModelFiles([explore]);

        const modelFiles = modelFilesOf(result.files);
        expect(modelFiles).toHaveLength(1);
        expect(modelFiles[0].filename).toBe('metrics_only.yml');
        const parsed = parseYaml(modelFiles[0].contents) as {
            models: Array<{ meta?: { metrics?: Record<string, unknown> } }>;
        };
        expect(Object.keys(parsed.models[0].meta?.metrics ?? {})).toHaveLength(
            3_000,
        );
        expect(indexOf(result.files)).toContain(
            'metrics_only  metrics_only.yml',
        );
    });

    it('lists every model in the index even when descriptions no longer fit', () => {
        const explores = Array.from({ length: 1_500 }, (_, i) =>
            buildExplore(`model_${i}`, 1, { descriptionLength: 200 }),
        );

        const index = indexOf(exploresToModelFiles(explores).files);

        expect(Buffer.byteLength(index)).toBeLessThan(256_000);
        for (const explore of explores) {
            expect(index).toContain(`${explore.name}  ${explore.name}.yml`);
        }
    });

    it('gives colliding model names distinct filenames', () => {
        const result = exploresToModelFiles([
            buildExplore('sales/eu', 1),
            buildExplore('sales_eu', 1),
        ]);

        const filenames = modelFilesOf(result.files).map(
            (file) => file.filename,
        );
        expect(new Set(filenames).size).toBe(2);

        const index = indexOf(result.files);
        for (const filename of filenames) {
            expect(index).toContain(filename);
        }
    });
});
