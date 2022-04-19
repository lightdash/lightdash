import { SEED_PROJECT } from 'common';

describe('Explore', () => {
    before(() => {
        // @ts-ignore
        cy.login();
        // @ts-ignore
        cy.preCompileProject();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should query orders', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();
        cy.get('th b').first().should('have.text', 'First name').click();
        cy.get('td', { timeout: 10000 }).eq(1).should('have.text', 'Aaron');
    });

    it('Should save chart', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();
        cy.get('th b').first().should('have.text', 'First name').click();
        cy.get('td', { timeout: 10000 }).eq(1).should('have.text', 'Aaron');

        cy.findByText('Charts').prev().click(); // open chart

        cy.findByText('Save chart').click();
        cy.get('input#chart-name').type('My chart');
        cy.findByText('Save').click();
        cy.findByText('Success! Chart was updated.');

        cy.findByText('Save changes').parent().should('be.disabled');

        // TODO introduce more changes
        cy.findByText('Column chart').click(); // Change chart type
        cy.findByText('Bar chart').click();

        cy.findByText('Save changes').parent().should('not.be.disabled');
        cy.findByText('Save changes').parent().click();

        cy.findByText('Success! Chart was saved.');
    });

    // TODO test `save chart` from chart list at home
    // TODO test `save chart` from dashboard on `edit chart`
    // TODO test `save chart` from dashboard on `explore here`
});
