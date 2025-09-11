import {
    CreateEmbedJwt,
    FilterInteractivityValues,
    SEED_PROJECT,
} from '@lightdash/common';
import { updateEmbedConfigDashboards } from '../api/embedManagement.cy';

const getEmbedUrl = (body: CreateEmbedJwt) =>
    cy.request({
        url: `/api/v1/embed/${SEED_PROJECT.project_uuid}/get-embed-url`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body,
    });

const getJaffleDashboard = () =>
    cy.request(
        `/api/v2/content?pageSize=1&contentTypes=dashboard&search=jaffle`,
    );

describe('Embedded dashboard', () => {
    beforeEach(() => {
        cy.login();
    });
    it('I can view embedded dashboard and all interactivity options', () => {
        getJaffleDashboard().then((dashboardsResp) => {
            const dashboardUuid = dashboardsResp.body.results.data[0]?.uuid;

            // First we need to whitelist the dashboard in the embed config
            updateEmbedConfigDashboards([dashboardUuid]).then((updateResp) => {
                expect(updateResp.status).to.eq(200);

                getEmbedUrl({
                    content: {
                        type: 'dashboard',
                        dashboardUuid,
                        dashboardFiltersInteractivity: {
                            enabled: FilterInteractivityValues.all,
                        },
                        canExportCsv: true,
                        canExportImages: true,
                        canDateZoom: true,
                        canExportPagePdf: true,
                    },
                }).then((resp) => {
                    // make sure we are logged out and rely on embed token
                    cy.logout();

                    // visit embed url
                    cy.visit(resp.body.results.url);

                    // Check tiles
                    cy.contains('Welcome to Lightdash!'); // markdown
                    cy.contains(
                        'Lightdash is an open source analytics for your dbt project.',
                    ); // markdown

                    cy.contains('Payments total revenue'); // big number tile

                    cy.contains(`What's the average spend per customer?`); // bar chart
                    cy.contains('Average order size'); // bar chart

                    cy.contains(
                        'Which customers have not recently ordered an item?',
                    ); // table chart
                    cy.contains('Days between created and first order'); // table chart

                    // Check filters
                    cy.contains('Is completed is True');
                    cy.contains(
                        'Order date year in the last 10 completed years',
                    );

                    // Check export options
                    cy.contains(
                        `What's the average spend per customer?`,
                    ).trigger('mouseenter');
                    cy.findByTestId('tile-icon-more').click();
                    cy.contains('Download data');
                    cy.contains('Export image');

                    // Check date zoom
                    cy.contains('Date Zoom');
                });
            });
        });
    });

    it('I can use "Explore from here" in embedded dashboard and view the correct elements', () => {
        getJaffleDashboard().then((dashboardsResp) => {
            const dashboardUuid = dashboardsResp.body.results.data[0]?.uuid;

            // First we need to whitelist the dashboard in the embed config
            updateEmbedConfigDashboards([dashboardUuid]).then((updateResp) => {
                expect(updateResp.status).to.eq(200);

                getEmbedUrl({
                    content: {
                        type: 'dashboard',
                        dashboardUuid,
                        dashboardFiltersInteractivity: {
                            enabled: FilterInteractivityValues.all,
                        },
                        canExplore: true,
                    },
                }).then((resp) => {
                    // make sure we are logged out and rely on embed token
                    cy.logout();

                    // visit embed url
                    cy.visit(resp.body.results.url);

                    cy.contains('Welcome to Lightdash!');
                    cy.contains('Total revenue');

                    // Find a chart tile and click "Explore from here"
                    cy.contains(
                        `How much revenue do we have per payment method?`,
                    ).trigger('mouseenter');
                    cy.findByTestId('tile-icon-more').click();
                    cy.contains('Explore from here').click();

                    // Should navigate to embedded explore page
                    cy.url().should('include', '/embed/');
                    cy.url().should('include', '/explore/');

                    // Check that "Back to Dashboard" button is visible
                    cy.contains('Back to Dashboard').should('be.visible');

                    // Check that core explorer elements are visible
                    cy.contains('Filters').should('be.visible');
                    cy.contains('Chart').should('be.visible');
                    cy.contains('Results').should('be.visible');

                    // Check that refresh button is visible (look for "Run query" text)
                    cy.contains('Run query').should('be.visible');

                    // Check that elements that should NOT be visible in embedded mode are hidden
                    // Save chart button should not be visible in embedded mode
                    cy.contains('Save chart').should('not.exist');

                    // Share button should not be visible in embedded mode
                    cy.contains('Share').should('not.exist');

                    // SQL card should not be visible in embedded mode (requires permissions)
                    cy.contains('SQL').should('not.exist');

                    // Refresh DBT button should not be visible in embedded mode
                    cy.contains('Refresh dbt').should('not.exist');

                    // No error message should be visible
                    cy.contains('Error').should('not.exist');

                    // Test going back to dashboard
                    cy.contains('Back to Dashboard').click();
                    cy.url().should('include', '/embed/');
                    cy.url().should('not.include', '/explore/');

                    // Should be back on the dashboard
                    cy.contains('Welcome to Lightdash!').should('be.visible');
                });
            });
        });
    });
});
