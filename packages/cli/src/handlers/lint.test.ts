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

        await expect(
            lintHandler({ path: tempDir, format: 'cli' }),
        ).rejects.toThrow('process.exit');
        expect(process.exit).toHaveBeenCalledWith(2);
        const lintOutput = output.join('\n');

        expect(lintOutput).toContain('missing-version.yml');
        expect(lintOutput).toContain("Missing required property 'version'");
        expect(lintOutput).toContain('2 Lightdash Code files');
        expect(lintOutput).toContain('1 valid');
        expect(lintOutput).toContain('1 invalid');
    });

    test('fails when a chart upload file cannot be parsed', async () => {
        const chartsDir = path.join(tempDir, 'charts');
        await fs.mkdir(chartsDir);
        await fs.writeFile(
            path.join(chartsDir, 'invalid-yaml.yml'),
            ['name: Invalid YAML', 'slug: invalid-yaml', 'sql: ]'].join('\n'),
        );

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('invalid-yaml.yml');
        expect(lintOutput).toContain('chart/parse');
        expect(lintOutput).toContain('"startLine": 3');
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
            [
                'contentType: sql_chart',
                'name: Misplaced SQL chart',
                'sql: SELECT 1',
            ].join('\n'),
        );

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('sql-chart.yml');
        expect(lintOutput).toContain("Missing required property 'version'");
    });

    test('accepts structurally recognized SQL charts selected for upload', async () => {
        const chartsDir = path.join(tempDir, 'charts');
        await fs.mkdir(chartsDir);
        await fs.writeFile(
            path.join(tempDir, 'sql-chart.yml'),
            [
                'contentType: sql_chart',
                'name: Loose SQL chart',
                'sql: SELECT 1',
            ].join('\n'),
        );
        await fs.writeFile(
            path.join(chartsDir, 'sql-chart.yml'),
            ['name: Folder SQL chart', 'sql: SELECT 1'].join('\n'),
        );

        await lintHandler({ path: tempDir, format: 'cli' });

        expect(process.exit).not.toHaveBeenCalled();
        expect(output.join('\n')).toContain(
            'All Lightdash Code files are valid!',
        );
    });

    test('ignores loose YAML files upload would not select', async () => {
        await fs.writeFile(
            path.join(tempDir, 'unrelated.yml'),
            ['version: 1', 'metricQuery: {}', 'name: Not uploadable'].join(
                '\n',
            ),
        );

        await lintHandler({ path: tempDir, format: 'cli' });

        expect(process.exit).not.toHaveBeenCalled();
        expect(output.join('\n')).toContain('No Lightdash Code files found.');
    });

    test('accepts merge keys that upload resolves with js-yaml', async () => {
        const dashboardsDir = path.join(tempDir, 'dashboards');
        await fs.mkdir(dashboardsDir);
        await fs.writeFile(
            path.join(dashboardsDir, 'merged-tabs.yml'),
            [
                'contentType: dashboard',
                'name: Merged tabs',
                'slug: merged-tabs',
                'spaceSlug: shared',
                'version: 1',
                'tiles: []',
                'tabs:',
                '  - &tab',
                '    name: Overview',
                '    order: 0',
                '  - <<: *tab',
                '    name: Details',
                '    order: 1',
            ].join('\n'),
        );

        await lintHandler({ path: tempDir, format: 'cli' });

        expect(process.exit).not.toHaveBeenCalled();
        expect(output.join('\n')).toContain(
            'All Lightdash Code files are valid!',
        );
    });

    test('reports parse errors for loose content files and models', async () => {
        const modelsDir = path.join(tempDir, 'models');
        await fs.mkdir(modelsDir);
        await fs.writeFile(
            path.join(tempDir, 'loose-chart.yml'),
            [
                'contentType: chart',
                'name: Broken chart',
                'bad: [unterminated',
            ].join('\n'),
        );
        await fs.writeFile(
            path.join(modelsDir, 'broken-model.yml'),
            ['type: model', 'name: Broken model', 'bad: [unterminated'].join(
                '\n',
            ),
        );

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('loose-chart.yml');
        expect(lintOutput).toContain('chart/parse');
        expect(lintOutput).toContain('broken-model.yml');
        expect(lintOutput).toContain('model/parse');
    });

    test('reports .yaml content files as unsupported', async () => {
        const chartsDir = path.join(tempDir, 'charts');
        await fs.mkdir(chartsDir);
        await fs.writeFile(
            path.join(chartsDir, 'unsupported.yaml'),
            'name: Unsupported extension',
        );

        const lintOutput = await expectLintFailure();

        expect(lintOutput).toContain('unsupported.yaml');
        expect(lintOutput).toContain('chart/extension');
        expect(lintOutput).toContain(
            "Content files must use the '.yml' extension",
        );
    });

    test('defaults strict content discovery to the upload root', async () => {
        const thirdPartyChartsDir = path.join(tempDir, 'vendor', 'charts');
        await fs.mkdir(thirdPartyChartsDir, { recursive: true });
        await fs.writeFile(
            path.join(thirdPartyChartsDir, 'unrelated.yml'),
            'name: Not Lightdash content',
        );
        vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

        await lintHandler({ format: 'cli' });

        expect(process.exit).not.toHaveBeenCalled();
        expect(output.join('\n')).toContain('No Lightdash Code files found.');
    });

    test('discovers content when run from inside the download root', async () => {
        const chartsDir = path.join(tempDir, 'charts');
        await fs.mkdir(chartsDir);
        await fs.writeFile(
            path.join(chartsDir, 'missing-version.yml'),
            'name: Missing version',
        );
        vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

        await expect(lintHandler({ format: 'cli' })).rejects.toThrow(
            'process.exit',
        );

        expect(output.join('\n')).toContain('missing-version.yml');
        expect(output.join('\n')).toContain(
            "Missing required property 'version'",
        );
    });

    test('shows the filename when linting a single file', async () => {
        const dashboardsDir = path.join(tempDir, 'dashboards');
        await fs.mkdir(dashboardsDir);
        const dashboardPath = path.join(dashboardsDir, 'single-file.yml');
        await fs.writeFile(dashboardPath, 'name: Missing version');

        await expect(
            lintHandler({ path: dashboardPath, format: 'cli' }),
        ).rejects.toThrow('process.exit');

        expect(output.join('\n')).toContain('✗ single-file.yml');
    });
});
