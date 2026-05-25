import { DashboardAsCode } from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { testHelpers } from './download';

const { getDashboardChartSlugs } = testHelpers;

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
