import { SEED_PROJECT } from '@lightdash/common';

describe('Dashboard List', () => {
    before(() => {
        cy.login();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should display dashboards', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.findByRole('button', { name: 'Browse' }).click();
        cy.findByRole('menuitem', { name: 'All dashboards' }).click();
        cy.findByText('Jaffle dashboard').should('exist');
    });

    it('Should create a new dashboard', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.findByRole('button', { name: 'Browse' }).click();
        cy.findByRole('menuitem', { name: 'All dashboards' }).click();
        cy.findByRole('button', { name: 'Create dashboard' }).click();

        cy.url().should(
            'match',
            /.*\/projects\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/dashboards\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
        );
        cy.findByText('Untitled dashboard').should('exist');
    });

    it('Should update dashboards', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.findByRole('button', { name: 'Browse' }).click();
        cy.findByRole('menuitem', { name: 'All dashboards' }).click();
        // open actions menu
        cy.contains('tr', 'Untitled dashboard').find('button').wait(1000); // TODO: hack for react-table rerenders
        cy.contains('tr', 'Untitled dashboard').find('button').click();
        // click on rename
        cy.findByRole('button', { name: 'Rename' }).click();
        cy.findByLabelText('Name *').clear().type('e2e dashboard');
        // click on save
        cy.findByRole('button', { name: 'Save' }).click();

        // verify dashboard name has been updated in the list
        cy.findByText('e2e dashboard').should('exist');
    });

    it('Should delete dashboards', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.findByRole('button', { name: 'Browse' }).click();
        cy.findByRole('menuitem', { name: 'All dashboards' }).click();
        // open actions menu
        cy.contains('tr', 'e2e dashboard').find('button').wait(1000); // TODO: hack for react-table rerenders
        cy.contains('tr', 'e2e dashboard').find('button').click();
        // click on delete
        cy.findByRole('button', { name: 'Delete' }).click();
        // click on delete in the popup
        cy.findByText('Delete').click();
        cy.findByText('Jaffle dashboard'); // still exists
    });
});
