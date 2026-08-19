import { ContentType, LightdashError } from '@lightdash/common';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { parse } from 'yaml';
import * as apiClient from './dbt/apiClient';
import {
    applyLocalChartSlugUpdate,
    executeChartSlugUpdate,
    getLocalSlugUpdateFileChanges,
    planLocalChartSlugUpdate,
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
    test('updates chart files, language maps, references, filenames, and metadata', async () => {
        const root = await createTemporaryContent();
        const chartFile = path.join(root, 'charts', 'copy-of-orders.yml');
        const languageMapFile = path.join(
            root,
            'charts',
            'copy-of-orders.language.map.yml',
        );
        const dashboardFile = path.join(root, 'dashboards', 'overview.yml');
        const alertFile = path.join(root, 'alerts', 'orders-alert.yml');
        const unrelatedFile = path.join(root, 'dashboards', 'unrelated.yml');
        const unrelatedSource =
            '# Keep this file byte-identical\ncontentType: dashboard\nslug: unrelated\ntiles: []\n';

        await Promise.all([
            fs.writeFile(
                chartFile,
                '# Chart comment\ncontentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n',
            ),
            fs.writeFile(
                languageMapFile,
                'chart:\n  copy-of-orders:\n    name: Orders\n',
            ),
            fs.writeFile(
                dashboardFile,
                [
                    'contentType: dashboard',
                    'slug: overview',
                    'tiles:',
                    '  - type: saved_chart',
                    '    tileSlug: copy-of-orders',
                    '    properties:',
                    '      chartSlug: copy-of-orders',
                    '  - type: sql_chart',
                    '    properties:',
                    '      chartSlug: copy-of-orders',
                    '',
                ].join('\n'),
            ),
            fs.writeFile(
                alertFile,
                'contentType: alert\nslug: orders-alert\nresource:\n  type: chart\n  slug: copy-of-orders\n',
            ),
            fs.writeFile(unrelatedFile, unrelatedSource),
            fs.writeFile(
                path.join(root, '.lightdash-metadata.json'),
                JSON.stringify({
                    version: 1,
                    charts: { 'copy-of-orders': 'timestamp' },
                    dashboards: { overview: 'dashboard-timestamp' },
                }),
            ),
        ]);

        const plan = await planLocalChartSlugUpdate(
            root,
            'copy-of-orders',
            'orders',
        );
        expect(plan.referencesUpdated).toBe(4);
        expect(plan.fileMoves).toHaveLength(2);
        expect(getLocalSlugUpdateFileChanges(plan, root)).toEqual([
            { source: '.lightdash-metadata.json' },
            { source: path.join('alerts', 'orders-alert.yml') },
            {
                source: path.join('charts', 'copy-of-orders.language.map.yml'),
                target: path.join('charts', 'orders.language.map.yml'),
            },
            {
                source: path.join('charts', 'copy-of-orders.yml'),
                target: path.join('charts', 'orders.yml'),
            },
            { source: path.join('dashboards', 'overview.yml') },
        ]);
        await applyLocalChartSlugUpdate(plan);

        await expect(fs.access(chartFile)).rejects.toThrow();
        await expect(fs.access(languageMapFile)).rejects.toThrow();

        const renamedChart = parse(
            await fs.readFile(path.join(root, 'charts', 'orders.yml'), 'utf8'),
        );
        expect(renamedChart.slug).toBe('orders');
        expect(
            await fs.readFile(path.join(root, 'charts', 'orders.yml'), 'utf8'),
        ).toContain('# Chart comment');

        const languageMap = parse(
            await fs.readFile(
                path.join(root, 'charts', 'orders.language.map.yml'),
                'utf8',
            ),
        );
        expect(languageMap.chart.orders.name).toBe('Orders');
        expect(languageMap.chart['copy-of-orders']).toBeUndefined();

        const dashboard = parse(await fs.readFile(dashboardFile, 'utf8'));
        expect(dashboard.tiles[0]).toMatchObject({
            tileSlug: 'copy-of-orders',
            properties: { chartSlug: 'orders' },
        });
        expect(dashboard.tiles[1].properties.chartSlug).toBe('copy-of-orders');
        expect(parse(await fs.readFile(alertFile, 'utf8')).resource.slug).toBe(
            'orders',
        );
        expect(await fs.readFile(unrelatedFile, 'utf8')).toBe(unrelatedSource);

        const metadata = JSON.parse(
            await fs.readFile(
                path.join(root, '.lightdash-metadata.json'),
                'utf8',
            ),
        );
        expect(metadata).toEqual({
            version: 1,
            charts: { orders: 'timestamp' },
            dashboards: { overview: 'dashboard-timestamp' },
        });
    });

    test('is idempotent after local files have already been updated', async () => {
        const root = await createTemporaryContent();
        await fs.writeFile(
            path.join(root, 'charts', 'copy-of-orders.yml'),
            'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n',
        );

        await applyLocalChartSlugUpdate(
            await planLocalChartSlugUpdate(root, 'copy-of-orders', 'orders'),
        );
        const secondPlan = await planLocalChartSlugUpdate(
            root,
            'copy-of-orders',
            'orders',
        );

        expect(secondPlan).toEqual({
            fileUpdates: [],
            fileMoves: [],
            metadata: undefined,
            referencesUpdated: 0,
        });
    });

    test('planning a dry run does not change local files or call the API', async () => {
        const root = await createTemporaryContent();
        const chartFile = path.join(root, 'charts', 'copy-of-orders.yml');
        const source =
            'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n';
        await fs.writeFile(chartFile, source);
        const api = vi.spyOn(apiClient, 'lightdashApi');

        const plan = await planLocalChartSlugUpdate(
            root,
            'copy-of-orders',
            'orders',
        );

        expect(getLocalSlugUpdateFileChanges(plan, root)).toEqual([
            {
                source: path.join('charts', 'copy-of-orders.yml'),
                target: path.join('charts', 'orders.yml'),
            },
        ]);
        expect(api).not.toHaveBeenCalled();
        expect(await fs.readFile(chartFile, 'utf8')).toBe(source);
        await expect(
            fs.access(path.join(root, 'charts', 'orders.yml')),
        ).rejects.toThrow();
    });

    test('rejects a local target collision before changing files', async () => {
        const root = await createTemporaryContent();
        const sourceFile = path.join(root, 'charts', 'copy-of-orders.yml');
        await Promise.all([
            fs.writeFile(
                sourceFile,
                'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n',
            ),
            fs.writeFile(
                path.join(root, 'charts', 'orders.yml'),
                'contentType: chart\nslug: another-chart\nname: Another\nmetricQuery: {}\n',
            ),
        ]);

        await expect(
            planLocalChartSlugUpdate(root, 'copy-of-orders', 'orders'),
        ).rejects.toThrow('already exists');
        expect(await fs.readFile(sourceFile, 'utf8')).toContain(
            'slug: copy-of-orders',
        );
    });

    test('rejects malformed target slugs before constructing file paths', async () => {
        const root = await createTemporaryContent();
        const chartFile = path.join(root, 'charts', 'copy-of-orders.yml');
        const source =
            'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n';
        await fs.writeFile(chartFile, source);

        await expect(
            planLocalChartSlugUpdate(root, 'copy-of-orders', '../../orders'),
        ).rejects.toThrow('target slug must contain');
        expect(await fs.readFile(chartFile, 'utf8')).toBe(source);
    });

    test('does not change local files when the server rejects the rename', async () => {
        const root = await createTemporaryContent();
        const chartFile = path.join(root, 'charts', 'copy-of-orders.yml');
        const source =
            'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n';
        await fs.writeFile(chartFile, source);
        vi.spyOn(apiClient, 'lightdashApi').mockRejectedValue(
            new LightdashError({
                message: 'Slug already in use',
                name: 'ConflictError',
                statusCode: 409,
                data: {},
            }),
        );

        await expect(
            executeChartSlugUpdate(
                'project-uuid',
                root,
                'copy-of-orders',
                'orders',
            ),
        ).rejects.toThrow('Slug already in use');

        expect(await fs.readFile(chartFile, 'utf8')).toBe(source);
        await expect(
            fs.access(path.join(root, 'charts', 'orders.yml')),
        ).rejects.toThrow();
        expect(
            (await fs.readdir(path.join(root, 'charts'))).some((file) =>
                file.includes('.slug-update-'),
            ),
        ).toBe(false);
    });

    test('reserves the new slug on the server before changing local files', async () => {
        const root = await createTemporaryContent();
        const chartFile = path.join(root, 'charts', 'copy-of-orders.yml');
        await fs.writeFile(
            chartFile,
            'contentType: chart\nslug: copy-of-orders\nname: Orders\nmetricQuery: {}\n',
        );
        vi.spyOn(apiClient, 'lightdashApi').mockImplementation(async () => {
            expect(await fs.readFile(chartFile, 'utf8')).toContain(
                'slug: copy-of-orders',
            );
            await expect(
                fs.access(path.join(root, 'charts', 'orders.yml')),
            ).rejects.toThrow();
            return undefined;
        });

        await executeChartSlugUpdate(
            'project-uuid',
            root,
            'copy-of-orders',
            'orders',
        );

        await expect(fs.access(chartFile)).rejects.toThrow();
        expect(
            await fs.readFile(path.join(root, 'charts', 'orders.yml'), 'utf8'),
        ).toContain('slug: orders');
    });
});

describe('content slug rename API', () => {
    test('calls the generic rename endpoint once', async () => {
        const api = vi
            .spyOn(apiClient, 'lightdashApi')
            .mockResolvedValue(undefined);

        await requestSlugUpdate('project-uuid', {
            resourceType: ContentType.CHART,
            from: 'old-chart',
            to: 'new-chart',
        });

        expect(api).toHaveBeenCalledExactlyOnceWith({
            method: 'POST',
            url: '/api/v1/projects/project-uuid/slugs/rename',
            body: JSON.stringify({
                resourceType: ContentType.CHART,
                from: 'old-chart',
                to: 'new-chart',
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
            requestSlugUpdate('project-uuid', {
                resourceType: ContentType.CHART,
                from: 'old-chart',
                to: 'new-chart',
            }),
        ).rejects.toThrow(
            'This Lightdash server does not support slug-update yet',
        );
    });
});
