import { SEED_PROJECT } from '@lightdash/common';

describe('Dashboard List', () => {
    beforeEach(() => {
        cy.login();
    });

    it('creates, renames, and deletes a dashboard', () => {
        const dashboardName = `e2e dashboard ${Date.now()}`;
        const renamedDashboardName = `${dashboardName} renamed`;

        cy.intercept('POST', '**/api/v1/projects/*/dashboards').as(
            'createDashboard',
        );
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        cy.findByRole('button', { name: 'Create dashboard' }).click();
        cy.findByLabelText('Name your dashboard *').type(dashboardName);
        cy.findByLabelText('Dashboard description').type('Description');
        cy.findByRole('button', { name: 'Next' }).click();
        cy.findByRole('button', { name: 'Create' })
            .should('be.enabled')
            .click();
        cy.wait('@createDashboard')
            .its('response.statusCode')
            .should('eq', 201);
        cy.url().should('match', /\/projects\/[^/]+\/dashboards\/[^/]+\/edit$/);
        cy.findByText(dashboardName).should('exist');

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/dashboards`);
        cy.contains('tr', dashboardName).find('button').click();
        cy.findByRole('menuitem', { name: 'Rename' }).click();
        cy.findByLabelText('Name *').clear().type(renamedDashboardName);
        cy.findByRole('button', { name: 'Save' }).click();
        cy.contains('tr', renamedDashboardName).should('exist');

        cy.contains('tr', renamedDashboardName).find('button').click();
        cy.findByRole('menuitem', { name: 'Delete dashboard' }).click();
        cy.findByRole('button', { name: 'Delete' }).click();
        cy.contains('tr', renamedDashboardName).should('not.exist');
    });
});
