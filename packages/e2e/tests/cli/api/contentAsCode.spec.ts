import { SEED_PROJECT } from '@lightdash/common';
import {
    existsSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
    expect,
    getApiToken,
    PACKAGE_ROOT,
    runCli,
    test,
    withAdminApi,
} from '../../../support/test';

const lightdashDir = join(PACKAGE_ROOT, 'lightdash');

// Same as `ls <dir> | wc -l`: hidden files are not counted.
const countFiles = (dir: string) =>
    readdirSync(dir).filter((name) => !name.startsWith('.')).length;

// Same as `sed -i "s/<pattern>/<replacement>/"` on every line of the file.
const replaceInFile = (path: string, pattern: RegExp, replacement: string) =>
    writeFileSync(
        path,
        readFileSync(path, 'utf8').replace(pattern, replacement),
    );

test.describe.serial('Content as Code CLI', () => {
    test.beforeAll(async ({ playwright }) => {
        const lightdashUrl = test.info().project.use.baseURL;
        const apiToken = await withAdminApi(playwright, getApiToken);
        // Pin the project: CI login otherwise picks the first project in the org,
        // which can be a short-lived one from a concurrently running spec
        const result = await runCli(
            `lightdash login ${lightdashUrl} --token ${apiToken} --project ${SEED_PROJECT.project_uuid}`,
            {
                env: {
                    NODE_ENV: 'development',
                    CI: 'true',
                },
            },
        );
        expect(result.stderr).toContain('Login successful');
    });
    test.beforeEach(() => {
        // Clean up any existing lightdash directory
        rmSync(lightdashDir, { recursive: true, force: true });
    });

    test('should download charts as code using CLI', async () => {
        const result = await runCli('lightdash download');
        expect(result.code).toBe(0);

        // Count chart files and make sure there are more than 0
        expect(countFiles(join(lightdashDir, 'charts'))).toBeGreaterThan(0);
        expect(countFiles(join(lightdashDir, 'dashboards'))).toBeGreaterThan(0);
    });

    test('should download charts and dashboards using slugs', async () => {
        // Requires download to be run first
        const result = await runCli(
            'lightdash download -c "what-s-the-average-spend-per-customer" -d "jaffle-dashboard"',
        );
        expect(result.code).toBe(0);
        expect(countFiles(join(lightdashDir, 'charts'))).toBe(5);
        expect(countFiles(join(lightdashDir, 'dashboards'))).toBe(1);
    });

    test('should upload modified charts as code using CLI', async () => {
        test.setTimeout(240_000);
        // Requires download to be run first
        const download = await runCli('lightdash download');
        expect(download.code).toBe(0);
        const chartFilePath = join(
            lightdashDir,
            'charts/what-s-the-average-spend-per-customer.yml',
        );
        const metadataPath = join(lightdashDir, '.lightdash-metadata.json');
        const chartSlug = 'what-s-the-average-spend-per-customer';

        const date1MinuteAgo = new Date(Date.now() - 60000).toISOString();
        // Update the chart description
        replaceInFile(
            chartFilePath,
            /description: .*/g,
            `description: Updated description from CLI test ${date1MinuteAgo}`,
        );

        // Backdate downloadedAt in the metadata file to trigger the upload.
        // downloadedAt is stored in .lightdash-metadata.json (not in the YAML).
        // see `needsUpdating` variable in download.ts for more details
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as {
            charts: Record<string, string>;
        };
        metadata.charts[chartSlug] = date1MinuteAgo;
        writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        const upload = await runCli('lightdash upload --verbose', {
            timeout: 180_000,
        });
        expect(upload.stdout).toContain('charts updated: 1');
        expect(upload.code).toBe(0);
    });

    test('should create new dashboard if we change the slug using CLI', async () => {
        test.setTimeout(240_000);
        // Requires download to be run first
        const download = await runCli('lightdash download');
        expect(download.code).toBe(0);
        const dashboardFilePath = join(
            lightdashDir,
            'dashboards/jaffle-dashboard.yml',
        );

        // Changing the slug means there's no metadata entry for it,
        // so needsUpdating defaults to true and the upload triggers a create.
        replaceInFile(
            dashboardFilePath,
            /slug: .*/g,
            `slug: jaffle-dashboard-${new Date().getTime()}`,
        );

        const upload = await runCli('lightdash upload --verbose', {
            timeout: 180_000,
        });
        expect(upload.stdout).toContain('dashboards created: 1');
        expect(upload.code).toBe(0);
    });

    test('should create a new SQL chart using CLI upload', async () => {
        test.setTimeout(240_000);
        // First download to create the directory structure
        const download = await runCli('lightdash download');
        expect(download.code).toBe(0);

        // Create a new SQL chart YAML file
        const sqlChartSlug = `sql-chart-cli-test-${new Date().getTime()}`;
        const sqlChartContent = `
name: SQL Chart CLI Test
description: A SQL chart created via CLI test
slug: ${sqlChartSlug}
sql: SELECT * FROM "postgres"."jaffle"."orders" LIMIT 5
limit: 500
config:
  type: table
  display: {}
  metadata:
    version: 1
  columns: {}
chartKind: table
spaceSlug: jaffle-shop
version: 1
updatedAt: "${new Date().toISOString()}"
downloadedAt: "${new Date(Date.now() - 60000).toISOString()}"
`;

        writeFileSync(
            join(lightdashDir, `charts/${sqlChartSlug}.sql.yml`),
            sqlChartContent,
        );

        const upload = await runCli('lightdash upload --verbose', {
            timeout: 180_000,
        });
        expect(upload.stdout).toContain('charts created: 1');
        expect(upload.code).toBe(0);
    });

    test('should download SQL chart by slug using CLI', async () => {
        test.setTimeout(240_000);
        // First create a SQL chart to download
        const sqlChartSlug = `sql-chart-cli-download-${new Date().getTime()}`;
        const sqlChartContent = `
name: SQL Chart CLI Download Test
description: A SQL chart for download test
slug: ${sqlChartSlug}
sql: SELECT * FROM "postgres"."jaffle"."payments" LIMIT 10
limit: 500
config:
  type: table
  display: {}
  metadata:
    version: 1
  columns: {}
chartKind: table
spaceSlug: jaffle-shop
version: 1
updatedAt: "${new Date().toISOString()}"
downloadedAt: "${new Date(Date.now() - 60000).toISOString()}"
`;

        // Download first to create dir structure
        const download = await runCli('lightdash download');
        expect(download.code).toBe(0);

        // Create the SQL chart file (using .sql.yml extension)
        writeFileSync(
            join(lightdashDir, `charts/${sqlChartSlug}.sql.yml`),
            sqlChartContent,
        );

        // Upload to create it on the server
        const upload = await runCli('lightdash upload --verbose', {
            timeout: 180_000,
        });
        expect(upload.code).toBe(0);

        // Clean up and download only that SQL chart by slug
        rmSync(lightdashDir, { recursive: true, force: true });
        const downloadBySlug = await runCli(
            `lightdash download -c "${sqlChartSlug}"`,
        );
        expect(downloadBySlug.code).toBe(0);

        // Verify the SQL chart was downloaded (with .sql.yml extension)
        expect(
            existsSync(join(lightdashDir, `charts/${sqlChartSlug}.sql.yml`)),
        ).toBe(true);
    });

    test('should update an existing SQL chart using CLI upload', async () => {
        test.setTimeout(420_000);
        // First create a SQL chart
        const sqlChartSlug = `sql-chart-cli-update-${new Date().getTime()}`;
        const sqlChartContent = `
name: SQL Chart CLI Update Test
description: Original description
slug: ${sqlChartSlug}
sql: SELECT * FROM "postgres"."jaffle"."orders" LIMIT 5
limit: 500
config:
  type: table
  display: {}
  metadata:
    version: 1
  columns: {}
chartKind: table
spaceSlug: jaffle-shop
version: 1
updatedAt: "${new Date().toISOString()}"
downloadedAt: "${new Date(Date.now() - 60000).toISOString()}"
`;

        // Download first to create dir structure
        const download = await runCli('lightdash download');
        expect(download.code).toBe(0);

        // Create the SQL chart file (using .sql.yml extension)
        const sqlChartPath = join(
            lightdashDir,
            `charts/${sqlChartSlug}.sql.yml`,
        );
        writeFileSync(sqlChartPath, sqlChartContent);

        // Upload to create it on the server
        const create = await runCli('lightdash upload --verbose', {
            timeout: 180_000,
        });
        expect(create.stdout).toContain('charts created: 1');
        expect(create.code).toBe(0);

        // Now update the description
        const date1MinuteAgo = new Date(Date.now() - 60000).toISOString();
        replaceInFile(
            sqlChartPath,
            /description: .*/g,
            `description: Updated description from CLI test`,
        );
        replaceInFile(
            sqlChartPath,
            /downloadedAt: .*/g,
            `downloadedAt: ${date1MinuteAgo}`,
        );

        // Upload the update
        const update = await runCli('lightdash upload --verbose', {
            timeout: 180_000,
        });
        expect(update.stdout).toContain('charts updated: 1');
        expect(update.code).toBe(0);
    });
});
