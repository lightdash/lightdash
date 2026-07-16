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
        let privateSpaceUrl: string;
        let privateSpaceUuid: string;
        let privateChartUuid: string;
        let privateDashboardUuid: string;

        // Create private space
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);

        // Close omnibar if it's open
        cy.get('body').then(($body) => {
            if ($body.text().includes('Search Jaffle shop')) {
                cy.get('body').type('{esc}');
            }
        });

        cy.contains('New').click();
        cy.contains('Organize your saved charts and dashboards.').click();
        cy.findByText('Restricted access').click();
        cy.findByPlaceholderText('eg. KPIs')
            .click()
            .clear()
            .type(`Private space ${timestamp}`, { delay: 50 });
        cy.get('button').contains('Create').click();

        // Wait for space page to load
        cy.contains(`Private space ${timestamp}`).should('be.visible');
        cy.url()
            .should('match', /\/spaces\/[0-9a-f-]{36}$/)
            .then((url) => {
                privateSpaceUrl = url;
                privateSpaceUuid = url.split('/').at(-1)!;
            });

        // Create new chart
        cy.get('[data-testid="Space/AddButton"]').click();
        cy.contains('Create new chart').click();
        cy.contains(/^Orders$/).click();
        cy.scrollTreeToItem('Total order amount');
        cy.contains('Total order amount').click();
        cy.scrollTreeToItem('Status');
        cy.contains('Status').click();
        cy.contains('Save chart').click();
        cy.contains('Chart name');

        cy.get('.mantine-8-Modal-body').find('button').should('be.disabled');
        cy.get('[data-testid="ChartCreateModal/NameInput"]')
            .type(`Private chart ${timestamp}`)
            .should('have.value', `Private chart ${timestamp}`);

        // Saves to space by default
        cy.get('.mantine-8-Modal-body')
            .find('button')
            .should('not.be.disabled')
            .contains('Next')
            .click();
        cy.get('.mantine-8-Modal-body')
            .find('button')
            .should('not.be.disabled')
            .contains('Save')
            .click();

        cy.contains('Success! Chart was saved.').should('exist');
        cy.url()
            .should('match', /\/saved\/[0-9a-f-]{36}\/view$/)
            .then((url) => {
                privateChartUuid = url.split('/').at(-2)!;
            });

        cy.then(() =>
            cy
                .request<{ results: { uuid: string } }>({
                    method: 'POST',
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
                    body: {
                        name: `Private dashboard ${timestamp}`,
                        spaceUuid: privateSpaceUuid,
                        tiles: [],
                        tabs: [],
                    },
                })
                .then((response) => {
                    expect(response.status).to.eq(201);
                    privateDashboardUuid = response.body.results.uuid;
                }),
        );

        cy.then(() => {
            cy.visit(privateSpaceUrl);
        });

        // Check all items exist in private space
        cy.contains('All').click();
        cy.contains(`Private dashboard ${timestamp}`);
        cy.contains(`Private chart ${timestamp}`);

        return cy.then(() => ({
            privateSpaceUuid,
            privateChartUuid,
            privateDashboardUuid,
        }));
    };

    it('Another non-admin user cannot see private content', () => {
        createPrivateSpace().then(
            ({ privateSpaceUuid, privateChartUuid, privateDashboardUuid }) => {
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

                for (const url of [
                    `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${privateSpaceUuid}`,
                    `/api/v2/projects/${SEED_PROJECT.project_uuid}/saved/${privateChartUuid}`,
                    `/api/v2/projects/${SEED_PROJECT.project_uuid}/dashboards/${privateDashboardUuid}`,
                ]) {
                    cy.request({ url, failOnStatusCode: false })
                        .its('status')
                        .should('eq', 403);
                }
            },
        );
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

    it.skip('can see all the spaces on Admin content view', () => {
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

    it.skip('can see nested spaces', () => {
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
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        cy.contains('Parent Space 1').click();
        cy.contains('Child Space 1.1').click();
        cy.get('[data-testid="Space/AddButton"]').click();
        cy.contains('Create new dashboard').click();
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
