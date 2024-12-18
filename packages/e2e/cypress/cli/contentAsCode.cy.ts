describe('Content as Code CLI', () => {
    const lightdashDir = './lightdash';

    beforeEach(() => {
        cy.login();
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

    it.only('should upload modified charts as code using CLI', () => {
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
});
