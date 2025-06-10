import {
    CreateEmbedJwt,
    FilterInteractivityValues,
    SEED_PROJECT,
} from '@lightdash/common';

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

                cy.contains('1,103'); // big number

                cy.contains(`What's the average spend per customer?`); // bar chart
                cy.contains('Average order size'); // bar chart

                cy.contains(
                    'Which customers have not recently ordered an item?',
                ); // table chart
                cy.contains('Days between created and first order'); // table chart

                // Check filters
                cy.contains('Is completed is True');
                cy.contains('Order date year in the last 10 completed years');

                // Check export options
                cy.contains(`What's the average spend per customer?`).trigger(
                    'mouseenter',
                );
                cy.findByTestId('tile-icon-more').click();
                cy.contains('Download data');
                cy.contains('Export image');

                // Check date zoom
                cy.contains('Date Zoom');
            });
        });
    });
});
