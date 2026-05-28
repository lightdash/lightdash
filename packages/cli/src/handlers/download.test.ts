import { DashboardAsCode, FilterOperator } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { testHelpers } from './download';

const { getDashboardChartSlugs, sanitizeDashboardForUpload } = testHelpers;

type LooseDashboard = DashboardAsCode & { needsUpdating: boolean };

const makeLooseDashboard = (
    slug: string,
    chartSlugs: (string | undefined)[],
): LooseDashboard =>
    ({
        slug,
        name: slug,
        spaceSlug: 'test-space',
        version: 1,
        tiles: chartSlugs.map((chartSlug) => ({
            properties: chartSlug ? { chartSlug } : {},
        })),
        needsUpdating: false,
    }) as unknown as LooseDashboard;

const writeFolderDashboard = async (
    baseDir: string,
    slug: string,
    chartSlugs: string[],
) => {
    const tilesYaml = chartSlugs
        .map(
            (s) =>
                `  - properties:\n      chartSlug: ${s}\n    type: saved_chart`,
        )
        .join('\n');
    const yaml = `contentType: dashboard\nname: ${slug}\nslug: ${slug}\nspaceSlug: test-space\ntiles:\n${tilesYaml}\nversion: 1\n`;
    await fs.writeFile(path.join(baseDir, 'dashboards', `${slug}.yml`), yaml);
};

describe('getDashboardChartSlugs', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'download-test-'));
        await fs.mkdir(path.join(tmpDir, 'dashboards'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('extracts chart slugs from folder dashboards', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', [
            'chart-a',
            'chart-b',
        ]);
        const slugs = await getDashboardChartSlugs([], tmpDir);
        expect(slugs.sort()).toEqual(['chart-a', 'chart-b']);
    });

    it('extracts chart slugs from loose dashboards (PROD-7869 regression)', async () => {
        const loose = makeLooseDashboard('loose-dash', [
            'loose-chart-1',
            'loose-chart-2',
        ]);
        const slugs = await getDashboardChartSlugs([], tmpDir, [loose]);
        expect(slugs.sort()).toEqual(['loose-chart-1', 'loose-chart-2']);
    });

    it('extracts chart slugs from both folder and loose dashboards when unioned', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', ['folder-chart']);
        const loose = makeLooseDashboard('loose-dash', ['loose-chart']);
        const slugs = await getDashboardChartSlugs([], tmpDir, [loose]);
        expect(slugs.sort()).toEqual(['folder-chart', 'loose-chart']);
    });

    it('filters by slug across both folder and loose sources', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', ['folder-chart']);
        const loose = makeLooseDashboard('loose-dash', ['loose-chart']);

        const onlyFolder = await getDashboardChartSlugs(
            ['folder-dash'],
            tmpDir,
            [loose],
        );
        expect(onlyFolder).toEqual(['folder-chart']);

        const onlyLoose = await getDashboardChartSlugs(['loose-dash'], tmpDir, [
            loose,
        ]);
        expect(onlyLoose).toEqual(['loose-chart']);
    });

    it('returns empty array when slug filter matches no dashboards', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', ['folder-chart']);
        const loose = makeLooseDashboard('loose-dash', ['loose-chart']);
        const slugs = await getDashboardChartSlugs(['nonexistent'], tmpDir, [
            loose,
        ]);
        expect(slugs).toEqual([]);
    });

    it('skips tiles without a chartSlug (e.g. markdown, loom)', async () => {
        const loose = makeLooseDashboard('loose-dash', [
            'real-chart',
            undefined,
            undefined,
        ]);
        const slugs = await getDashboardChartSlugs([], tmpDir, [loose]);
        expect(slugs).toEqual(['real-chart']);
    });
});

describe('sanitizeDashboardForUpload (PROD-7445)', () => {
    const makeDashboard = (dimensions: unknown[]): DashboardAsCode =>
        ({
            name: 'd',
            slug: 'd',
            spaceSlug: 's',
            version: 1,
            tiles: [],
            tabs: [],
            filters: {
                dimensions,
                metrics: [],
                tableCalculations: [],
            },
        }) as unknown as DashboardAsCode;

    const validFilter = {
        operator: FilterOperator.EQUALS,
        disabled: false,
        values: ['x'],
        label: 'valid',
        target: { fieldId: 'a', tableName: 't' },
    };
    const malformed = {
        operator: FilterOperator.EQUALS,
        disabled: false,
        values: [],
        label: 'malformed',
        target: { fieldId: 'b', tableName: 't' },
    };
    const notNullFilter = {
        operator: FilterOperator.NOT_NULL,
        disabled: false,
        values: [],
        label: 'notNull',
        target: { fieldId: 'c', tableName: 't' },
    };

    it('drops malformed dimension filters', () => {
        const result = sanitizeDashboardForUpload(makeDashboard([malformed]));
        expect(result.droppedFilters).toBe(1);
        expect(result.dashboard.filters?.dimensions).toEqual([]);
    });

    it('keeps valid filters and notNull (no-value-required) filters', () => {
        const result = sanitizeDashboardForUpload(
            makeDashboard([validFilter, notNullFilter]),
        );
        expect(result.droppedFilters).toBe(0);
        expect(result.dashboard.filters?.dimensions).toHaveLength(2);
    });

    it('drops only the malformed filter when mixed', () => {
        const result = sanitizeDashboardForUpload(
            makeDashboard([validFilter, malformed, notNullFilter]),
        );
        expect(result.droppedFilters).toBe(1);
        const kept = result.dashboard.filters?.dimensions ?? [];
        expect(kept).toHaveLength(2);
        expect(kept).toEqual(
            expect.arrayContaining([validFilter, notNullFilter]),
        );
    });

    it('is a no-op when there are no filters', () => {
        const dashboard = {
            name: 'd',
            slug: 'd',
            spaceSlug: 's',
            version: 1,
            tiles: [],
            tabs: [],
        } as unknown as DashboardAsCode;
        const result = sanitizeDashboardForUpload(dashboard);
        expect(result.droppedFilters).toBe(0);
        expect(result.dashboard).toBe(dashboard);
    });

    it('drops malformed filters from metrics and tableCalculations too', () => {
        const dashboard = {
            name: 'd',
            slug: 'd',
            spaceSlug: 's',
            version: 1,
            tiles: [],
            tabs: [],
            filters: {
                dimensions: [malformed],
                metrics: [malformed],
                tableCalculations: [malformed],
            },
        } as unknown as DashboardAsCode;
        const result = sanitizeDashboardForUpload(dashboard);
        expect(result.droppedFilters).toBe(3);
        expect(result.dashboard.filters?.dimensions).toEqual([]);
        expect(result.dashboard.filters?.metrics).toEqual([]);
        expect(result.dashboard.filters?.tableCalculations).toEqual([]);
    });
});
