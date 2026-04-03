import { test, expect } from '../../../fixtures';
import { getApiToken } from '../../../helpers';
import { execSync } from 'child_process';

const lightdashDir = './lightdash';
const lightdashUrl = process.env.BASE_URL || 'http://localhost:3000';

function exec(
    command: string,
    options: { env?: Record<string, string> } = {},
): { stdout: string; stderr: string; code: number } {
    try {
        const stdout = execSync(command, {
            encoding: 'utf-8',
            env: { ...process.env, ...options.env },
        });
        return { stdout, stderr: '', code: 0 };
    } catch (e: unknown) {
        const error = e as {
            stdout?: string;
            stderr?: string;
            status?: number;
        };
        return {
            stdout: error.stdout ?? '',
            stderr: error.stderr ?? '',
            code: error.status ?? 1,
        };
    }
}

test.describe('Content as Code CLI', () => {
    test.beforeAll(async ({ browser }) => {
        // Login and get API token for CLI authentication
        const context = await browser.newContext({
            storageState: 'playwright/.auth/admin.json',
        });
        const page = await context.newPage();
        const apiToken = await getApiToken(page.request);
        const result = exec(
            `lightdash login ${lightdashUrl} --token ${apiToken}`,
            {
                env: {
                    NODE_ENV: 'development',
                    CI: 'true',
                },
            },
        );
        expect(result.stderr).toContain('Login successful');
        await context.close();
    });

    test.beforeEach(async () => {
        // Clean up any existing lightdash directory
        exec(`rm -rf ${lightdashDir}`);
    });

    test('should download charts as code using CLI', async () => {
        const result = exec('lightdash download');
        expect(result.code).toBe(0);

        // Count chart files and make sure there are more than 0
        const chartsResult = exec(`ls ${lightdashDir}/charts | wc -l`);
        const chartCount = parseInt(chartsResult.stdout.trim(), 10);
        expect(chartCount).toBeGreaterThan(0);

        const dashboardsResult = exec(`ls ${lightdashDir}/dashboards | wc -l`);
        const dashboardCount = parseInt(dashboardsResult.stdout.trim(), 10);
        expect(dashboardCount).toBeGreaterThan(0);
    });

    test('should download charts and dashboards using slugs', async () => {
        const result = exec(
            'lightdash download -c "what-s-the-average-spend-per-customer" -d "jaffle-dashboard"',
        );
        expect(result.code).toBe(0);

        const chartsResult = exec(`ls ${lightdashDir}/charts | wc -l`);
        const chartCount = parseInt(chartsResult.stdout.trim(), 10);
        expect(chartCount).toBe(5);

        const dashboardsResult = exec(`ls ${lightdashDir}/dashboards | wc -l`);
        const dashboardCount = parseInt(dashboardsResult.stdout.trim(), 10);
        expect(dashboardCount).toBe(1);
    });

    test('should upload modified charts as code using CLI', async () => {
        const downloadResult = exec('lightdash download');
        expect(downloadResult.code).toBe(0);

        const chartFilePath = `lightdash/charts/what-s-the-average-spend-per-customer.yml`;
        const metadataPath = `lightdash/.lightdash-metadata.json`;
        const chartSlug = 'what-s-the-average-spend-per-customer';

        const date1MinuteAgo = new Date(Date.now() - 60000).toISOString();
        const updateSedDescription = `s/description: .*/description: Updated description from CLI test ${date1MinuteAgo}/`;
        // Update the chart description
        const sedResult = exec(`sed -i "" "${updateSedDescription}" ${chartFilePath}`);
        expect(sedResult.code).toBe(0);

        // Backdate downloadedAt in the metadata file to trigger the upload.
        const nodeResult = exec(
            `node -e "const fs = require('fs'); const m = JSON.parse(fs.readFileSync('${metadataPath}', 'utf-8')); m.charts['${chartSlug}'] = '${date1MinuteAgo}'; fs.writeFileSync('${metadataPath}', JSON.stringify(m, null, 2));"`,
        );
        expect(nodeResult.code).toBe(0);

        const uploadResult = exec('lightdash upload --verbose');
        expect(uploadResult.stdout).toContain('charts updated: 1');
        expect(uploadResult.code).toBe(0);
    });

    test('should create new dashboard if we change the slug using CLI', async () => {
        const downloadResult = exec('lightdash download');
        expect(downloadResult.code).toBe(0);

        const dashboardFilePath = `lightdash/dashboards/jaffle-dashboard.yml`;

        // Changing the slug means there's no metadata entry for it,
        // so needsUpdating defaults to true and the upload triggers a create.
        const updateSedSlug = `s/slug: .*/slug: jaffle-dashboard-${new Date().getTime()}/`;
        const sedResult = exec(`sed -i "" "${updateSedSlug}" ${dashboardFilePath}`);
        expect(sedResult.code).toBe(0);

        const uploadResult = exec('lightdash upload --verbose');
        expect(uploadResult.stdout).toContain('dashboards created: 1');
        expect(uploadResult.code).toBe(0);
    });

    test('should create a new SQL chart using CLI upload', async () => {
        // First download to create the directory structure
        const downloadResult = exec('lightdash download');
        expect(downloadResult.code).toBe(0);

        // Create a new SQL chart YAML file
        const sqlChartSlug = `sql-chart-cli-test-${new Date().getTime()}`;
        const sqlChartContent = `name: SQL Chart CLI Test
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

        const writeResult = exec(
            `cat > ${lightdashDir}/charts/${sqlChartSlug}.sql.yml << 'ENDOFFILE'\n${sqlChartContent}\nENDOFFILE`,
        );
        expect(writeResult.code).toBe(0);

        const uploadResult = exec('lightdash upload --verbose');
        expect(uploadResult.stdout).toContain('charts created: 1');
        expect(uploadResult.code).toBe(0);
    });

    test('should download SQL chart by slug using CLI', async () => {
        // First create a SQL chart to download
        const sqlChartSlug = `sql-chart-cli-download-${new Date().getTime()}`;
        const sqlChartContent = `name: SQL Chart CLI Download Test
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
        const downloadResult = exec('lightdash download');
        expect(downloadResult.code).toBe(0);

        // Create the SQL chart file (using .sql.yml extension)
        const writeResult = exec(
            `cat > ${lightdashDir}/charts/${sqlChartSlug}.sql.yml << 'ENDOFFILE'\n${sqlChartContent}\nENDOFFILE`,
        );
        expect(writeResult.code).toBe(0);

        // Upload to create it on the server
        const uploadResult = exec('lightdash upload --verbose');
        expect(uploadResult.code).toBe(0);

        // Clean up and download only that SQL chart by slug
        exec(`rm -rf ${lightdashDir}`);
        const downloadBySlugResult = exec(
            `lightdash download -c "${sqlChartSlug}"`,
        );
        expect(downloadBySlugResult.code).toBe(0);

        // Verify the SQL chart was downloaded (with .sql.yml extension)
        const lsResult = exec(
            `ls ${lightdashDir}/charts/${sqlChartSlug}.sql.yml`,
        );
        expect(lsResult.code).toBe(0);
    });

    test('should update an existing SQL chart using CLI upload', async () => {
        // First create a SQL chart
        const sqlChartSlug = `sql-chart-cli-update-${new Date().getTime()}`;
        const sqlChartContent = `name: SQL Chart CLI Update Test
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
        const downloadResult = exec('lightdash download');
        expect(downloadResult.code).toBe(0);

        // Create the SQL chart file (using .sql.yml extension)
        const writeResult = exec(
            `cat > ${lightdashDir}/charts/${sqlChartSlug}.sql.yml << 'ENDOFFILE'\n${sqlChartContent}\nENDOFFILE`,
        );
        expect(writeResult.code).toBe(0);

        // Upload to create it on the server
        const createResult = exec('lightdash upload --verbose');
        expect(createResult.stdout).toContain('charts created: 1');
        expect(createResult.code).toBe(0);

        // Now update the description
        const date1MinuteAgo = new Date(Date.now() - 60000).toISOString();
        const updateSedDescription = `s/description: .*/description: Updated description from CLI test/`;
        const updateSedDownloadedAt = `s/downloadedAt: .*/downloadedAt: ${date1MinuteAgo}/`;
        const sedResult = exec(
            `sed -i "" "${updateSedDescription}" ${lightdashDir}/charts/${sqlChartSlug}.sql.yml && sed -i "" "${updateSedDownloadedAt}" ${lightdashDir}/charts/${sqlChartSlug}.sql.yml`,
        );
        expect(sedResult.code).toBe(0);

        // Upload the update
        const uploadResult = exec('lightdash upload --verbose');
        expect(uploadResult.stdout).toContain('charts updated: 1');
        expect(uploadResult.code).toBe(0);
    });
});
