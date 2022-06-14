import { SEED_PROJECT } from '@lightdash/common';

describe('Explore', () => {
    before(() => {
        cy.login();
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
        cy.findByText('Success! Chart was saved.');

        // FIXME disabling save changes button is currently broken...
        // cy.findByText('Save changes').parent().should('be.disabled');

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading Wait until finish loading
        cy.findByText('Edit chart').parent().click();
        cy.findByText('Bar chart').click(); // Change chart type
        cy.findByText('Horizontal bar chart').click();

        // cy.findByText('Save changes').parent().should('not.be.disabled');
        cy.findByText('Save changes').parent().click();

        cy.findByText('Success! Chart was saved.');
    });

    it('Should change chart config type', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();
        cy.get('th b').first().should('have.text', 'First name').click();
        cy.get('td', { timeout: 10000 }).eq(1).should('have.text', 'Aaron');

        cy.findByText('Charts').prev().click(); // open chart

        cy.findByText('Customers First name');

        cy.findByText('Bar chart').click(); // Change chart type
        cy.findByText('Horizontal bar chart').click();

        cy.findByText('Customers First name');

        cy.findByText('Horizontal bar chart').click();
        cy.findByText('Line chart').click();

        cy.findByText('Customers First name');

        cy.findByText('Line chart').click();
        cy.findByText('Scatter chart').click();

        cy.findByText('Customers First name');

        cy.findByText('Scatter chart').click();
        cy.get('[name="Table"]').click();

        cy.findByText('Customers First name');

        cy.get('.bp4-icon-panel-table').first().parent().click();
        cy.findByText('Big number').click();

        cy.findByText('Orders Unique order count'); // Different label ¿?
    });

    it('Should change chart config layout', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();
        cy.get('th b').first().should('have.text', 'First name').click();
        cy.get('td', { timeout: 10000 }).eq(1).should('have.text', 'Aaron');

        cy.findByText('Charts').prev().click(); // open chart

        cy.findByText('Customers First name');
        cy.get('g').children('text').should('have.length.lessThan', 30); // without labels

        cy.findByText('Configure').click();
        cy.findByText('Series').click();
        cy.findByText('Value labels');
        cy.get('option[value="top"]').parent().select('top');

        cy.get('g').children('text').should('have.length.greaterThan', 30); // with labels
    });
    // TODO test `save chart` from chart list at home
    // TODO test `save chart` from dashboard on `edit chart`
    // TODO test `save chart` from dashboard on `explore here`
});
