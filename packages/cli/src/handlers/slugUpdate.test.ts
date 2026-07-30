import { ContentAsCodeType, LightdashError } from '@lightdash/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import * as apiClient from './dbt/apiClient';
import {
    applyLocalChartSlugUpdates,
    planLocalChartSlugUpdates,
    requestSlugUpdate,
} from './slugUpdate';

const temporaryDirectories: string[] = [];

const createTemporaryContent = async (): Promise<string> => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'slug-update-'));
    temporaryDirectories.push(root);
    await Promise.all(
        ['charts', 'dashboards', 'alerts'].map((folder) =>
            fs.mkdir(path.join(root, folder), { recursive: true }),
        ),
    );
    return root;
};

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) =>
                fs.rm(directory, { recursive: true, force: true }),
            ),
    );
});

describe('local chart slug updates', () => {
    test('updates chart files, dashboard and scheduled references, filenames, and metadata', async () => {
        const root = await createTemporaryContent();
        const chartFile = path.join(root, 'charts', 'copy-of-orders.yml');
        const languageMapFile = path.join(
            root,
            'charts',
            'copy-of-orders.language.map.yml',
        );
        const dashboardFile = path.join(root, 'dashboards', 'overview.yml');
        const alertFile = path.join(root, 'alerts', 'orders-alert.yml');
        await Promise.all([
            fs.writeFile(
                chartFile,
                'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n',
            ),
            fs.writeFile(languageMapFile, 'name: Orders\n'),
            fs.writeFile(
                dashboardFile,
                'contentType: dashboard\nslug: overview\ntiles:\n  - type: saved_chart\n    properties:\n      chartSlug: copy-of-orders\n',
            ),
            fs.writeFile(
                alertFile,
                'contentType: alert\nslug: orders-alert\nresource:\n  type: chart\n  slug: copy-of-orders\n',
            ),
            fs.writeFile(
                path.join(root, '.lightdash-metadata.json'),
                JSON.stringify({
                    version: 1,
                    charts: {
                        'copy-of-orders': '2026-07-30T10:00:00.000Z',
                    },
                    dashboards: {},
                }),
            ),
        ]);

        const plan = await planLocalChartSlugUpdates(root, [
            {
                contentUuid: 'chart-uuid',
                name: 'Orders',
                oldSlug: 'copy-of-orders',
                newSlug: 'orders',
            },
        ]);
        expect(plan.referencesUpdated).toBe(3);
        expect(plan.fileMoves).toHaveLength(2);

        await applyLocalChartSlugUpdates(plan);

        await expect(fs.access(chartFile)).rejects.toThrow();
        await expect(fs.access(languageMapFile)).rejects.toThrow();
        expect(
            parse(
                await fs.readFile(
                    path.join(root, 'charts', 'orders.yml'),
                    'utf8',
                ),
            ).slug,
        ).toBe('orders');
        expect(
            parse(await fs.readFile(dashboardFile, 'utf8')).tiles[0].properties
                .chartSlug,
        ).toBe('orders');
        expect(parse(await fs.readFile(alertFile, 'utf8')).resource.slug).toBe(
            'orders',
        );
        const metadata = JSON.parse(
            await fs.readFile(
                path.join(root, '.lightdash-metadata.json'),
                'utf8',
            ),
        );
        expect(metadata.charts).toEqual({
            orders: '2026-07-30T10:00:00.000Z',
        });
    });

    test('rejects a local filename collision before changing files', async () => {
        const root = await createTemporaryContent();
        await Promise.all([
            fs.writeFile(
                path.join(root, 'charts', 'copy-of-orders.yml'),
                'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n',
            ),
            fs.writeFile(
                path.join(root, 'charts', 'orders.yml'),
                'contentType: chart\nslug: another-chart\nname: Another chart\nmetricQuery: {}\n',
            ),
        ]);

        await expect(
            planLocalChartSlugUpdates(root, [
                {
                    contentUuid: 'chart-uuid',
                    name: 'Orders',
                    oldSlug: 'copy-of-orders',
                    newSlug: 'orders',
                },
            ]),
        ).rejects.toThrow('already exists');
    });

    test('supports legacy yaml files without changing SQL chart or unrelated content', async () => {
        const root = await createTemporaryContent();
        const chartFile = path.join(root, 'charts', 'copy-of-orders.yaml');
        const dashboardFile = path.join(root, 'dashboards', 'overview.yaml');
        const unrelatedFile = path.join(root, 'dashboards', 'unrelated.yml');
        const unrelatedSource =
            '# This file must remain byte-identical\ncontentType: dashboard\nslug: unrelated\ntiles: []\n';
        await Promise.all([
            fs.writeFile(
                chartFile,
                '# Keep this chart comment\ncontentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n',
            ),
            fs.writeFile(
                dashboardFile,
                [
                    '# Legacy dashboard with a tab UUID',
                    'contentType: dashboard',
                    'slug: overview',
                    'tiles:',
                    '  - type: saved_chart',
                    '    tabUuid: legacy-tab',
                    '    properties:',
                    '      chartSlug: copy-of-orders',
                    '  - type: sql_chart',
                    '    properties:',
                    '      chartSlug: copy-of-orders',
                    '  - type: saved_chart',
                    '    properties:',
                    '      chartSlug: null',
                    '',
                ].join('\n'),
            ),
            fs.writeFile(unrelatedFile, unrelatedSource),
        ]);

        const plan = await planLocalChartSlugUpdates(root, [
            {
                contentUuid: 'chart-uuid',
                name: 'Orders',
                oldSlug: 'copy-of-orders',
                newSlug: 'orders',
            },
        ]);
        await applyLocalChartSlugUpdates(plan);

        const renamedChartFile = path.join(root, 'charts', 'orders.yaml');
        const dashboardSource = await fs.readFile(dashboardFile, 'utf8');
        const dashboard = parse(dashboardSource);
        expect(await fs.readFile(renamedChartFile, 'utf8')).toContain(
            '# Keep this chart comment',
        );
        expect(dashboardSource).toContain('# Legacy dashboard with a tab UUID');
        expect(dashboard.tiles[0]).toMatchObject({
            tabUuid: 'legacy-tab',
            properties: { chartSlug: 'orders' },
        });
        expect(dashboard.tiles[1].properties.chartSlug).toBe('copy-of-orders');
        expect(dashboard.tiles[2].properties.chartSlug).toBeNull();
        expect(await fs.readFile(unrelatedFile, 'utf8')).toBe(unrelatedSource);
    });

    test('preserves metadata values through chained slug renames', async () => {
        const root = await createTemporaryContent();
        await Promise.all([
            fs.writeFile(
                path.join(root, 'charts', 'copy-of-a.yml'),
                'contentType: chart\nslug: copy-of-a\nname: A\nmetricQuery: {}\n',
            ),
            fs.writeFile(
                path.join(root, 'charts', 'copy-of-b.yml'),
                'contentType: chart\nslug: copy-of-b\nname: B\nmetricQuery: {}\n',
            ),
            fs.writeFile(
                path.join(root, '.lightdash-metadata.json'),
                JSON.stringify({
                    version: 1,
                    charts: {
                        'copy-of-a': 'timestamp-a',
                        'copy-of-b': 'timestamp-b',
                    },
                    dashboards: { overview: 'dashboard-timestamp' },
                }),
            ),
        ]);

        const plan = await planLocalChartSlugUpdates(root, [
            {
                contentUuid: 'a',
                name: 'A',
                oldSlug: 'copy-of-a',
                newSlug: 'copy-of-b',
            },
            {
                contentUuid: 'b',
                name: 'B',
                oldSlug: 'copy-of-b',
                newSlug: 'b',
            },
        ]);
        await applyLocalChartSlugUpdates(plan);

        expect(
            parse(
                await fs.readFile(
                    path.join(root, 'charts', 'copy-of-b.yml'),
                    'utf8',
                ),
            ).name,
        ).toBe('A');
        expect(
            parse(await fs.readFile(path.join(root, 'charts', 'b.yml'), 'utf8'))
                .name,
        ).toBe('B');
        const metadata = JSON.parse(
            await fs.readFile(
                path.join(root, '.lightdash-metadata.json'),
                'utf8',
            ),
        );
        expect(metadata).toEqual({
            version: 1,
            charts: {
                'copy-of-b': 'timestamp-a',
                b: 'timestamp-b',
            },
            dashboards: { overview: 'dashboard-timestamp' },
        });
    });

    test('is idempotent after files have already been updated', async () => {
        const root = await createTemporaryContent();
        await fs.writeFile(
            path.join(root, 'charts', 'copy-of-orders.yml'),
            'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n',
        );
        const changes = [
            {
                contentUuid: 'chart-uuid',
                name: 'Orders',
                oldSlug: 'copy-of-orders',
                newSlug: 'orders',
            },
        ];

        await applyLocalChartSlugUpdates(
            await planLocalChartSlugUpdates(root, changes),
        );
        const firstResult = await fs.readFile(
            path.join(root, 'charts', 'orders.yml'),
            'utf8',
        );
        const secondPlan = await planLocalChartSlugUpdates(root, changes);
        expect(secondPlan).toMatchObject({
            fileUpdates: [],
            fileMoves: [],
            metadata: undefined,
            referencesUpdated: 0,
        });
        await applyLocalChartSlugUpdates(secondPlan);
        expect(
            await fs.readFile(path.join(root, 'charts', 'orders.yml'), 'utf8'),
        ).toBe(firstResult);
    });

    test('restores every file and removes staging files when a move fails', async () => {
        const root = await createTemporaryContent();
        const chartFile = path.join(root, 'charts', 'copy-of-orders.yml');
        const dashboardFile = path.join(root, 'dashboards', 'overview.yml');
        const chartSource =
            'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n';
        const dashboardSource =
            'contentType: dashboard\nslug: overview\ntiles:\n  - type: saved_chart\n    properties:\n      chartSlug: copy-of-orders\n';
        await Promise.all([
            fs.writeFile(chartFile, chartSource),
            fs.writeFile(dashboardFile, dashboardSource),
        ]);
        const plan = await planLocalChartSlugUpdates(root, [
            {
                contentUuid: 'chart-uuid',
                name: 'Orders',
                oldSlug: 'copy-of-orders',
                newSlug: 'orders',
            },
        ]);
        vi.spyOn(fs, 'rename').mockImplementationOnce(async () => {
            throw new Error('simulated move failure');
        });

        await expect(applyLocalChartSlugUpdates(plan)).rejects.toThrow(
            'simulated move failure',
        );
        expect(await fs.readFile(chartFile, 'utf8')).toBe(chartSource);
        expect(await fs.readFile(dashboardFile, 'utf8')).toBe(dashboardSource);
        await expect(
            fs.access(path.join(root, 'charts', 'orders.yml')),
        ).rejects.toThrow();
        expect(
            (await fs.readdir(path.join(root, 'charts'))).some((file) =>
                file.includes('.slug-update-'),
            ),
        ).toBe(false);
    });
});

describe('content slug update API', () => {
    test('sends the generic content type and explicit slug mapping', async () => {
        const changes = [
            {
                contentUuid: 'chart-uuid',
                name: 'My chart',
                oldSlug: 'my-old-chart-name',
                newSlug: 'my-amazing-chart',
            },
        ];
        const api = vi
            .spyOn(apiClient, 'lightdashApi')
            .mockResolvedValue({ changes });

        await expect(
            requestSlugUpdate(
                'project-uuid',
                ContentAsCodeType.CHART,
                'my-old-chart-name',
                'my-amazing-chart',
                true,
            ),
        ).resolves.toEqual(changes);
        expect(api).toHaveBeenCalledWith({
            method: 'POST',
            url: '/api/v1/projects/project-uuid/code/slugs',
            body: JSON.stringify({
                contentType: ContentAsCodeType.CHART,
                oldSlug: 'my-old-chart-name',
                newSlug: 'my-amazing-chart',
                dryRun: true,
            }),
        });
    });

    test('explains when the connected server does not support slug-update', async () => {
        vi.spyOn(apiClient, 'lightdashApi').mockRejectedValue(
            new LightdashError({
                message: 'API endpoint not found',
                name: 'NotFoundError',
                statusCode: 404,
                data: {},
            }),
        );

        await expect(
            requestSlugUpdate(
                'project-uuid',
                ContentAsCodeType.CHART,
                'old-slug',
                'new-slug',
                true,
            ),
        ).rejects.toThrow(
            'This Lightdash server does not support slug-update yet',
        );
    });

    test('preserves other API not-found errors', async () => {
        vi.spyOn(apiClient, 'lightdashApi').mockRejectedValue(
            new LightdashError({
                message: 'Project not found',
                name: 'NotFoundError',
                statusCode: 404,
                data: {},
            }),
        );

        await expect(
            requestSlugUpdate(
                'project-uuid',
                ContentAsCodeType.CHART,
                'old-slug',
                'new-slug',
                true,
            ),
        ).rejects.toThrow('Project not found');
    });
});
