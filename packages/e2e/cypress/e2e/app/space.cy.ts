import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Custom dimensions', () => {
    beforeEach(() => {
        cy.login();
    });

    it('I can create a private space with private content', () => {
        const timestamp = new Date().toISOString();

        // Create private space
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.contains('New').click();
        cy.contains('Organize your saved charts and dashboards.').click();
        cy.findByPlaceholderText('eg. KPIs').type(`Private space ${timestamp}`);
        cy.get('button').contains('Create').click();

        // Create new chart
        cy.get('.tabler-icon-plus').click();
        cy.contains('Create new chart').click();
        cy.contains('Orders').click();
        cy.contains('Total order amount').click();
        cy.contains('Status').click();
        cy.contains('Save chart').click();
        cy.findByPlaceholderText(
            'eg. How many weekly active users do we have?',
        ).type(`Private chart ${timestamp}`);
        // Saves to space by default
        cy.get('.mantine-Modal-body').find('button').contains('Save').click();

        // Go back to space using breadcrumbs
        cy.contains('Private space').click();

        // Create new dashboard
        cy.get('.tabler-icon-plus').click();
        cy.contains('Create new dashboard').click();
        cy.findByPlaceholderText('eg. KPI Dashboard').type(
            `Private dashboard ${timestamp}`,
        );
        cy.get('.mantine-Modal-body').find('button').contains('Create').click();
        // At this point the dashboard is created, but empty
        // TODO add private chart to dashboard ?

        // Go back to space using url
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`); // I think we need to refresh the page for the items to appear
        cy.contains(`Private space ${timestamp}`).click();

        // Check all items exist in private space
        cy.contains('All items').click();
        cy.contains(`Private dashboard ${timestamp}`);
        cy.contains(`Private chart ${timestamp}`);
    });

    it('Another non-admin user cannot see private content', () => {
        // We assume the previous test has been run and the private space has been created
        // If this is causing issues, try reusing the `createPrivateChart` from spacePermissions.cy.ts
        cy.request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            failOnStatusCode: false,
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            const privateSpace = resp.body.results.find(
                (space) =>
                    space.name.toLowerCase().startsWith('private space') &&
                    space.chartCount !== '0' &&
                    space.dashboardCount !== '0',
            ); // Get a private space with charts and dashboards
            expect(privateSpace).to.not.eq(undefined);

            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${privateSpace.uuid}`,
                failOnStatusCode: false,
            }).then((spaceResp) => {
                expect(spaceResp.status).to.eq(200);

                const privateChart = spaceResp.body.results.queries[0];
                const privateDashboard = spaceResp.body.results.dashboards[0];

                expect(privateChart).to.not.eq(undefined);
                expect(privateDashboard).to.not.eq(undefined);

                cy.loginWithPermissions('member', [
                    {
                        role: 'editor',
                        projectUuid: SEED_PROJECT.project_uuid,
                    },
                ]);

                cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
                // Select role
                cy.findByPlaceholderText('Select your role').click();
                cy.contains('Product').click();
                cy.contains('Next').click();

                // Don't show private spaces in navbar
                cy.contains('Browse').click();
                cy.contains('Private space').should('not.exist');

                // Don't show private spaces in spaces page
                cy.contains('All Spaces').click();
                cy.contains('Jaffle shop');
                cy.contains('Private space').should('not.exist');

                // Navigate to private space and make sure we get a forbidden error
                cy.visit(
                    `/projects/${SEED_PROJECT.project_uuid}/spaces/${privateSpace.uuid}`,
                );
                cy.contains('You need access');

                // Navigate to private chart and make sure we get a forbidden error
                cy.visit(
                    `/projects/${SEED_PROJECT.project_uuid}/saved/${privateChart.uuid}`,
                );
                cy.contains('You need access');

                // Navigate to private dashboard and make sure we get a forbidden error
                cy.visit(
                    `/projects/${SEED_PROJECT.project_uuid}/dashboards/${privateDashboard.uuid}`,
                );
                cy.contains('You need access');
            });
        });
    });

    // TODO create public space
    // TODO create private  charts and dashboards without using the `create new` button from space
});
