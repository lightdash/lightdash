import {
    CreateDashboard,
    CreateEmbedJwt,
    DashboardTileTypes,
    FilterInteractivityValues,
    SEED_PROJECT,
} from '@lightdash/common';
import { createDashboard } from '../api/dashboard.cy';
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

    it('URL syncs for dashboard filters in direct mode', () => {
        getJaffleDashboard().then((dashboardsResp) => {
            const dashboardUuid = dashboardsResp.body.results.data[0]?.uuid;

            updateEmbedConfigDashboards([dashboardUuid]).then((updateResp) => {
                expect(updateResp.status).to.eq(200);

                getEmbedUrl({
                    content: {
                        type: 'dashboard',
                        dashboardUuid,
                        dashboardFiltersInteractivity: {
                            enabled: FilterInteractivityValues.all,
                        },
                    },
                }).then((resp) => {
                    cy.logout();
                    cy.visit(resp.body.results.url);

                    // Wait for dashboard to load
                    cy.contains('Welcome to Lightdash!');

                    // Verify initial URL has no filter params
                    cy.url().should('not.include', 'tempFilters=');
                    cy.url().should('not.include', 'filters=');

                    // Add a temporary filter
                    cy.contains('Add filter').click();
                    cy.findByTestId('FilterConfiguration/FieldSelect')
                        .click()
                        .type('payment method{downArrow}{enter}');
                    cy.findByPlaceholderText(
                        'Start typing to filter results',
                    ).type('credit_card');
                    cy.findByRole('option', { name: 'credit_card' }).click();
                    cy.findAllByRole('tab').eq(0).click();
                    cy.contains('button', 'Apply').click({ force: true });

                    // Verify URL contains tempFilters param
                    cy.url().should('include', 'tempFilters=');
                    cy.url().should('include', 'credit_card');

                    // Verify filter persists on reload
                    cy.reload();
                    cy.contains('Payment method is credit_card');

                    // Remove the filter
                    cy.contains('Payment method is credit_card')
                        .parent()
                        .findByLabelText('Remove filter')
                        .click();

                    // Verify URL no longer contains tempFilters param
                    cy.url().should('not.include', 'tempFilters=');
                });
            });
        });
    });

    it('URL syncs for date zoom in direct mode', () => {
        getJaffleDashboard().then((dashboardsResp) => {
            const dashboardUuid = dashboardsResp.body.results.data[0]?.uuid;

            updateEmbedConfigDashboards([dashboardUuid]).then((updateResp) => {
                expect(updateResp.status).to.eq(200);

                getEmbedUrl({
                    content: {
                        type: 'dashboard',
                        dashboardUuid,
                        canDateZoom: true,
                    },
                }).then((resp) => {
                    cy.logout();
                    cy.visit(resp.body.results.url);

                    // Wait for dashboard to load
                    cy.contains('Welcome to Lightdash!');

                    // Verify initial URL has no dateZoom param
                    cy.url().should('not.include', 'dateZoom=');

                    // Check that Date Zoom dropdown is visible
                    cy.contains('Date Zoom').should('be.visible');

                    // Click the Date Zoom dropdown
                    cy.contains('Date Zoom').click();

                    // Select a granularity (e.g., Month)
                    cy.contains('Month').click();

                    // Verify URL contains dateZoom param
                    cy.url().should('include', 'dateZoom=month');

                    // Verify date zoom persists on reload
                    cy.reload();
                    cy.url().should('include', 'dateZoom=month');

                    // Clear date zoom by selecting "None"
                    cy.contains('Date Zoom').click();
                    cy.contains('None').click();

                    // Verify URL no longer contains dateZoom param
                    cy.url().should('not.include', 'dateZoom=');
                });
            });
        });
    });

    it('URL syncs for tabs in direct mode', () => {
        const dashboardName = `Test Dashboard with Tabs ${Date.now()}`;
        const tab1Uuid = 'test-tab-1-uuid';
        const tab2Uuid = 'test-tab-2-uuid';

        // Create a dashboard with multiple tabs
        const dashboardWithTabs: CreateDashboard = {
            name: dashboardName,
            tiles: [
                {
                    type: DashboardTileTypes.MARKDOWN,
                    x: 0,
                    y: 0,
                    h: 3,
                    w: 6,
                    tabUuid: tab1Uuid,
                    properties: {
                        title: 'Tab 1 Content',
                        content: 'This is content for tab 1',
                    },
                },
                {
                    type: DashboardTileTypes.MARKDOWN,
                    x: 0,
                    y: 0,
                    h: 3,
                    w: 6,
                    tabUuid: tab2Uuid,
                    properties: {
                        title: 'Tab 2 Content',
                        content: 'This is content for tab 2',
                    },
                },
            ],
            tabs: [
                { uuid: tab1Uuid, name: 'First Tab', order: 0 },
                { uuid: tab2Uuid, name: 'Second Tab', order: 1 },
            ],
        };

        createDashboard(SEED_PROJECT.project_uuid, dashboardWithTabs).then(
            (newDashboard) => {
                updateEmbedConfigDashboards([newDashboard.uuid]).then(
                    (updateResp) => {
                        expect(updateResp.status).to.eq(200);

                        getEmbedUrl({
                            content: {
                                type: 'dashboard',
                                dashboardUuid: newDashboard.uuid,
                            },
                        }).then((resp) => {
                            cy.logout();
                            cy.visit(resp.body.results.url);

                            // Wait for dashboard to load
                            cy.contains('First Tab').should('be.visible');

                            // Verify initial URL doesn't include /tabs/ route
                            cy.url().should('not.include', '/tabs/');

                            // Verify first tab content is visible
                            cy.contains('Tab 1 Content').should('be.visible');

                            // Click on the second tab
                            cy.contains('Second Tab').click();

                            // Verify URL updates to include the second tab UUID
                            cy.url().should('include', `/tabs/${tab2Uuid}`);

                            // Verify second tab content is visible
                            cy.contains('Tab 2 Content').should('be.visible');

                            // Verify first tab content is not visible
                            cy.contains('Tab 1 Content').should('not.exist');

                            // Click back to the first tab
                            cy.contains('First Tab').click();

                            // Verify URL updates to include the first tab UUID
                            cy.url().should('include', `/tabs/${tab1Uuid}`);

                            // Verify first tab content is visible again
                            cy.contains('Tab 1 Content').should('be.visible');

                            // Verify second tab content is not visible
                            cy.contains('Tab 2 Content').should('not.exist');

                            // Clean up
                            cy.deleteDashboardsByName([dashboardName]);
                        });
                    },
                );
            },
        );
    });
});
