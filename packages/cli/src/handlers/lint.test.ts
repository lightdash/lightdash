import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lintHandler } from './lint';

vi.mock('../analytics/analytics', () => ({
    categorizeError: vi.fn(),
    LightdashAnalytics: {
        track: vi.fn().mockResolvedValue(undefined),
    },
}));

describe('lintHandler', () => {
    let tempDir: string;
    let output: string[];

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lightdash-lint-'));
        output = [];
        vi.spyOn(console, 'log').mockImplementation((...args) => {
            output.push(args.map(String).join(' '));
        });
        vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit');
        });
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    const expectLintFailure = async () => {
        await expect(
            lintHandler({ path: tempDir, format: 'json' }),
        ).rejects.toThrow('process.exit');
        expect(process.exit).toHaveBeenCalledWith(2);
        return output.join('\n');
    };

    test('fails for a dashboard upload file missing its required version', async () => {
        const dashboardsDir = path.join(tempDir, 'dashboards');
        await fs.mkdir(dashboardsDir);
        await fs.writeFile(
            path.join(dashboardsDir, 'missing-version.yml'),
            [
                'name: Missing version',
                'slug: missing-version',
                'spaceSlug: shared',
                'tiles: []',
                'tabs: []',
            ].join('\n'),
        );

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('missing-version.yml');
        expect(lintOutput).toContain("Missing required property 'version'");
    });

    test('fails for a chart missing its required version alongside a valid sibling', async () => {
        const chartsDir = path.join(tempDir, 'charts');
        const dashboardsDir = path.join(tempDir, 'dashboards');
        await fs.mkdir(chartsDir);
        await fs.mkdir(dashboardsDir);
        await fs.writeFile(
            path.join(chartsDir, 'missing-version.yml'),
            [
                'name: Missing version',
                'slug: missing-version',
                'spaceSlug: shared',
                'tableName: orders',
                'metricQuery:',
                '  exploreName: orders',
                '  dimensions: []',
                '  metrics: []',
                '  filters: {}',
                '  sorts: []',
                '  limit: 500',
                '  tableCalculations: []',
                '  additionalMetrics: []',
                '  customDimensions: []',
                'chartConfig:',
                '  type: table',
                '  config: {}',
            ].join('\n'),
        );
        await fs.writeFile(
            path.join(dashboardsDir, 'valid.yml'),
            [
                'name: Valid dashboard',
                'slug: valid-dashboard',
                'spaceSlug: shared',
                'tiles: []',
                'tabs: []',
                'version: 1',
            ].join('\n'),
        );

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('missing-version.yml');
        expect(lintOutput).toContain("Missing required property 'version'");
    });

    test('fails when a chart upload file cannot be parsed', async () => {
        const chartsDir = path.join(tempDir, 'charts');
        await fs.mkdir(chartsDir);
        await fs.writeFile(
            path.join(chartsDir, 'invalid-yaml.yml'),
            'name: [unterminated',
        );

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('invalid-yaml.yml');
        expect(lintOutput).toContain('chart/parse');
    });

    test('reports empty chart upload files as invalid', async () => {
        const chartsDir = path.join(tempDir, 'charts');
        await fs.mkdir(chartsDir);
        await fs.writeFile(path.join(chartsDir, 'empty.yml'), '');

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('empty.yml');
        expect(lintOutput).toContain('chart/type');
    });

    test('validates loose chart files by contentType', async () => {
        await fs.writeFile(
            path.join(tempDir, 'loose-chart.yml'),
            [
                'contentType: chart',
                'name: Missing version',
                'metricQuery: {}',
            ].join('\n'),
        );

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('loose-chart.yml');
        expect(lintOutput).toContain("Missing required property 'version'");
    });

    test('validates SQL chart content as a dashboard when placed in dashboards', async () => {
        const dashboardsDir = path.join(tempDir, 'dashboards');
        await fs.mkdir(dashboardsDir);
        await fs.writeFile(
            path.join(dashboardsDir, 'sql-chart.yml'),
            'contentType: sqlChart\nname: Misplaced SQL chart',
        );

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('sql-chart.yml');
        expect(lintOutput).toContain("Missing required property 'version'");
    });

    test('ignores YAML files upload would not select and SQL charts', async () => {
        const chartsDir = path.join(tempDir, 'charts');
        await fs.mkdir(chartsDir);
        await fs.writeFile(
            path.join(tempDir, 'unrelated.yml'),
            'metricQuery: {}\ntiles: []',
        );
        await fs.writeFile(
            path.join(tempDir, 'sql-chart.yml'),
            'contentType: sqlChart\nname: Loose SQL chart',
        );
        await fs.writeFile(
            path.join(chartsDir, 'sql-chart.yml'),
            'contentType: sqlChart\nname: Folder SQL chart',
        );

        await lintHandler({ path: tempDir, format: 'cli' });

        expect(process.exit).not.toHaveBeenCalled();
        expect(output.join('\n')).toContain('No Lightdash Code files found.');
    });
});
