describe('Content as Code CLI', () => {
    const lightdashDir = './lightdash';
    const lightdashUrl = Cypress.config('baseUrl');

    before(() => {
        cy.login();
        cy.getApiToken().then((apiToken) => {
            cy.exec(`lightdash login ${lightdashUrl} --token ${apiToken}`, {
                failOnNonZeroExit: false,
                env: {
                    NODE_ENV: 'development',
                    CI: true,
                },
            })
                .its('stderr')
                .should('contain', 'Login successful');
        });
    });
    beforeEach(() => {
        // Clean up any existing lightdash directory
        cy.exec(`rm -rf ${lightdashDir}`);
    });

    it('should download charts as code using CLI', () => {
        cy.exec('lightdash download').then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        // Count chart files and make sure there are more than 0
        cy.exec(`ls ${lightdashDir}/charts | wc -l`).then((result) => {
            const fileCount = parseInt(result.stdout, 10);
            cy.wrap(fileCount).should('be.gt', 0);
        });

        cy.exec(`ls ${lightdashDir}/dashboards | wc -l`).then((result) => {
            const fileCount = parseInt(result.stdout, 10);
            cy.wrap(fileCount).should('be.gt', 0);
        });
    });

    it('should download charts and dashboards using slugs', () => {
        // Requires download to be run first
        cy.exec(
            'lightdash download -c "what-s-the-average-spend-per-customer" -d "jaffle-dashboard"',
        ).then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });
        cy.exec(`ls ${lightdashDir}/charts | wc -l`).then((result) => {
            const fileCount = parseInt(result.stdout, 10);
            cy.wrap(fileCount).should('eq', 5);
        });

        cy.exec(`ls ${lightdashDir}/dashboards | wc -l`).then((result) => {
            const fileCount = parseInt(result.stdout, 10);
            cy.wrap(fileCount).should('eq', 1);
        });
    });

    it('should upload modified charts as code using CLI', () => {
        // Requires download to be run first
        cy.exec('lightdash download').then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });
        const chartFilePath = `lightdash/charts/what-s-the-average-spend-per-customer.yml`;

        const date1MinuteAgo = new Date(Date.now() - 60000).toISOString();
        const updateSedDescription = `s/description: .*/description: Updated description from CLI test ${date1MinuteAgo}/`;
        const updateSedDownloadedAt = `s/downloadedAt: .*/downloadedAt: ${date1MinuteAgo}/`;
        // We need to force the download time it to trigger the upload
        // see `needsUpdating` variable for more details
        cy.exec(
            `sed -i "${updateSedDescription}" ${chartFilePath} && sed -i "${updateSedDownloadedAt}" ${chartFilePath}`,
        ).then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        cy.exec('lightdash upload --verbose').then((result) => {
            cy.wrap(result.stdout).should('contain', 'charts updated: 1');
            cy.wrap(result.code).should('eq', 0);
        });
    });

    it('should create new dashboard if we change the slug using CLI', () => {
        // Requires download to be run first
        cy.exec('lightdash download').then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });
        const chartFilePath = `lightdash/dashboards/jaffle-dashboard.yml`;

        const date1MinuteAgo = new Date(Date.now() - 60000).toISOString();
        const updateSedSlug = `s/slug: .*/slug: jaffle-dashboard-${new Date().getTime()}/`;
        const updateSedDownloadedAt = `s/downloadedAt: .*/downloadedAt: ${date1MinuteAgo}/`;
        // We need to force the download time it to trigger the upload
        // see `needsUpdating` variable for more details
        cy.exec(
            `sed -i "${updateSedSlug}" ${chartFilePath} && sed -i "${updateSedDownloadedAt}" ${chartFilePath}`,
        ).then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        cy.exec('lightdash upload --verbose').then((result) => {
            cy.wrap(result.stdout).should('contain', 'dashboards created: 1');
            cy.wrap(result.code).should('eq', 0);
        });
    });

    it('should create a new SQL chart using CLI upload', () => {
        // First download to create the directory structure
        cy.exec('lightdash download').then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

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

        cy.exec(
            `echo '${sqlChartContent}' > ${lightdashDir}/charts/${sqlChartSlug}.sql.yml`,
        ).then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        cy.exec('lightdash upload --verbose').then((result) => {
            cy.wrap(result.stdout).should('contain', 'charts created: 1');
            cy.wrap(result.code).should('eq', 0);
        });
    });

    it('should download SQL chart by slug using CLI', () => {
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
        cy.exec('lightdash download').then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        // Create the SQL chart file (using .sql.yml extension)
        cy.exec(
            `echo '${sqlChartContent}' > ${lightdashDir}/charts/${sqlChartSlug}.sql.yml`,
        ).then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        // Upload to create it on the server
        cy.exec('lightdash upload --verbose').then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        // Clean up and download only that SQL chart by slug
        cy.exec(`rm -rf ${lightdashDir}`);
        cy.exec(`lightdash download -c "${sqlChartSlug}"`).then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        // Verify the SQL chart was downloaded (with .sql.yml extension)
        cy.exec(`ls ${lightdashDir}/charts/${sqlChartSlug}.sql.yml`).then(
            (result) => {
                cy.wrap(result.code).should('eq', 0);
            },
        );
    });

    it('should update an existing SQL chart using CLI upload', () => {
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
        cy.exec('lightdash download').then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        // Create the SQL chart file (using .sql.yml extension)
        cy.exec(
            `echo '${sqlChartContent}' > ${lightdashDir}/charts/${sqlChartSlug}.sql.yml`,
        ).then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        // Upload to create it on the server
        cy.exec('lightdash upload --verbose').then((result) => {
            cy.wrap(result.stdout).should('contain', 'charts created: 1');
            cy.wrap(result.code).should('eq', 0);
        });

        // Now update the description
        const date1MinuteAgo = new Date(Date.now() - 60000).toISOString();
        const updateSedDescription = `s/description: .*/description: Updated description from CLI test/`;
        const updateSedDownloadedAt = `s/downloadedAt: .*/downloadedAt: ${date1MinuteAgo}/`;
        cy.exec(
            `sed -i "${updateSedDescription}" ${lightdashDir}/charts/${sqlChartSlug}.sql.yml && sed -i "${updateSedDownloadedAt}" ${lightdashDir}/charts/${sqlChartSlug}.sql.yml`,
        ).then((result) => {
            cy.wrap(result.code).should('eq', 0);
        });

        // Upload the update
        cy.exec('lightdash upload --verbose').then((result) => {
            cy.wrap(result.stdout).should('contain', 'charts updated: 1');
            cy.wrap(result.code).should('eq', 0);
        });
    });
});
