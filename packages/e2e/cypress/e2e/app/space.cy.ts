/* eslint-disable no-restricted-syntax */
import { SEED_PROJECT, SPACE_TREE_1, SPACE_TREE_2 } from '@lightdash/common';

const apiUrl = '/api/v1';

const JAFFLE_SHOP_SPACE_NAME = SEED_PROJECT.name;
const TREE_1_ROOT_SPACE_NAMES = SPACE_TREE_1.map((space) => space.name);
const TREE_2_ROOT_SPACE_NAMES = SPACE_TREE_2.map((space) => space.name);

describe('Space', () => {
    beforeEach(() => {
        cy.login();
    });

    const createPrivateSpace = () => {
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
        cy.contains(/^Orders$/).click();
        cy.contains('Total order amount').click();
        cy.contains('Status').click();
        cy.contains('Save chart').click();
        cy.contains('Chart name');

        cy.get('.mantine-Modal-body').find('button').should('be.disabled');
        cy.get('[data-testid="ChartCreateModal/NameInput"]')
            .type(`Private chart ${timestamp}`)
            .should('have.value', `Private chart ${timestamp}`);

        // Saves to space by default
        cy.get('.mantine-Modal-body')
            .find('button')
            .should('not.be.disabled')
            .contains('Next')
            .click();
        cy.get('.mantine-Modal-body')
            .find('button')
            .should('not.be.disabled')
            .contains('Save')
            .click();

        cy.contains('Success! Chart was saved.').should('exist');

        // Go back to space using breadcrumbs
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        cy.contains(`Private space ${timestamp}`).click();

        // Create new dashboard
        cy.get('[data-testid="Space/AddButton"]').click();
        cy.contains('Create new dashboard').click();
        cy.findByPlaceholderText('eg. KPI Dashboard').type(
            `Private dashboard ${timestamp}`,
        );
        cy.findByText('Next').click();
        cy.findByText('Create').click();
        // At this point the dashboard is created, but empty
        // TODO add private chart to dashboard ?

        // Go back to space using url
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`); // I think we need to refresh the page for the items to appear
        cy.contains(`Private space ${timestamp}`).click();

        // Check all items exist in private space
        cy.contains('All').click();
        cy.contains(`Private dashboard ${timestamp}`);
        cy.contains(`Private chart ${timestamp}`);
    };

    it('Another non-admin user cannot see private content', () => {
        createPrivateSpace();

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
                cy.contains(JAFFLE_SHOP_SPACE_NAME);
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
});

describe('Admin access to spaces', () => {
    beforeEach(() => {
        cy.login();
    });

    it('can see all public spaces and private spaces w/ direct access', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        for (const spaceName of [
            JAFFLE_SHOP_SPACE_NAME,
            ...TREE_1_ROOT_SPACE_NAMES,
        ]) {
            cy.contains(spaceName);
        }
    });

    it('can see all the spaces on Admin content view', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        cy.contains('Admin Content View').click();

        for (const spaceName of [
            JAFFLE_SHOP_SPACE_NAME,
            ...TREE_1_ROOT_SPACE_NAMES,
            ...TREE_2_ROOT_SPACE_NAMES,
        ]) {
            cy.contains(spaceName);
        }
    });

    it('can see nested spaces', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        cy.contains('Admin Content View').click();

        cy.contains('Parent Space 4').click();
        cy.contains('Child Space 4.1').click();
    });

    it('can see all public and private spaces in admin Tree view', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.contains('New').click();
        cy.contains('Arrange multiple charts into a single view.').click();
        cy.findByPlaceholderText('eg. KPI Dashboard').type(
            `Test Dashboard ${new Date().toISOString()}`,
        );

        cy.get('[data-testid="DashboardCreateModal/Next"]').click();
        for (const spaceName of TREE_1_ROOT_SPACE_NAMES) {
            cy.contains(spaceName);
        }

        cy.contains('Admin Content View').click();

        for (const spaceName of [
            ...TREE_1_ROOT_SPACE_NAMES,
            ...TREE_2_ROOT_SPACE_NAMES,
        ]) {
            cy.contains(spaceName);
        }

        cy.contains('Parent Space 4').click();
        cy.contains('Child Space 4.1');
    });
});

describe('Editor access to spaces', () => {
    const EDITOR_ROOT_SPACE_NAMES = TREE_2_ROOT_SPACE_NAMES.concat([
        JAFFLE_SHOP_SPACE_NAME,
        'Parent Space 1',
        'Parent Space 3',
        'Parent Space 5',
    ]);

    beforeEach(() => {
        cy.loginAsEditor();
    });

    it('can see all public spaces and private spaces w/ access', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        for (const spaceName of EDITOR_ROOT_SPACE_NAMES) {
            cy.contains(spaceName);
        }

        cy.contains('Parent Space 2').should('not.exist');
    });

    it('can see nested spaces', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        cy.contains('Parent Space 4').click();
        cy.contains('Child Space 4.1');
    });

    it('can see all public and private spaces w/ access in Tree view', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.contains('New').click();
        cy.contains('Arrange multiple charts into a single view.').click();
        cy.findByPlaceholderText('eg. KPI Dashboard').type(
            `Test Dashboard ${new Date().toISOString()}`,
        );

        cy.get('[data-testid="DashboardCreateModal/Next"]').click();
        for (const spaceName of EDITOR_ROOT_SPACE_NAMES) {
            cy.contains(spaceName);
        }

        cy.contains('Parent Space 4').click();
        cy.contains('Child Space 4.1');
    });
});

describe('Viewer access to spaces', () => {
    const VIEWER_ROOT_SPACE_NAMES = [JAFFLE_SHOP_SPACE_NAME, 'Parent Space 1'];

    beforeEach(() => {
        cy.loginAsViewer();
    });

    it('can see all public spaces and private spaces w/ access', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        for (const spaceName of VIEWER_ROOT_SPACE_NAMES) {
            cy.contains(spaceName);
        }

        cy.contains('Parent Space 2').should('not.exist');
        cy.contains('Parent Space 5').should('not.exist');
    });

    it('can see nested spaces', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        cy.contains('Parent Space 1').click();
        cy.contains('Child Space 1.1');
        cy.contains('Child Space 1.2');
        cy.contains('Child Space 1.3');
    });
});

describe('Editor can create content', () => {
    beforeEach(() => {
        cy.loginAsEditor();
    });

    it('can create a new space', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        // Parent Space 1/Child Space 1.1
        cy.contains('Parent Space 1').click();
        cy.contains('Child Space 1.1').click();

        const spaceName = `TS ${+new Date()}`;

        cy.get('[data-testid="Space/AddButton"]').click();
        cy.contains('Create space').click();
        cy.findByPlaceholderText('eg. KPIs').type(spaceName);
        cy.get('button').contains('Create').click();
        cy.contains(spaceName);

        cy.get(`[data-testid="ResourceViewActionMenu/${spaceName}"]`).click();
        cy.contains('Delete space').click();
        cy.findByPlaceholderText('Space name').type(spaceName);
        cy.get('button').contains('Delete').click();

        cy.contains(spaceName).should('not.exist');

        // cy.contains(spaceName);
    });

    it('can create/delete a new dashboard', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        cy.contains('Parent Space 1').click();
        cy.contains('Child Space 1.1').click();

        const dashboardName = `TD ${+new Date()}`;

        cy.get('[data-testid="Space/AddButton"]').click();
        cy.contains('Create new dashboard').click();
        cy.findByPlaceholderText('eg. KPI Dashboard').type(dashboardName);
        cy.get('[data-testid="DashboardCreateModal/Next"]').click();
        cy.get('button').contains('Create').click();
        cy.wait(1500);
        cy.go('back');
        cy.wait(1500);
        cy.contains(dashboardName);

        cy.get(
            `[data-testid="ResourceViewActionMenu/${dashboardName}"]`,
        ).click();
        cy.contains('Delete dashboard').click();
        cy.get('button').contains('Delete').click();
    });
});
