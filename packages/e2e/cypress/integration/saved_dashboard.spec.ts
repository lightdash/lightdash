describe('Dashboard List', () => {
    before(() => {
        // @ts-ignore
        cy.login();
        // @ts-ignore
        cy.preCompileProject();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should display dashboards', () => {
        cy.visit('/');
        cy.get('[data-cy=browse]').trigger('mouseover');
        cy.findByRole('button', { name: 'Dashboards' }).click();
        cy.get('h5').should('have.text', 'Jaffle dashboard');
    });

    it('Should update dashboards', () => {
        cy.visit('/');
        cy.get('[data-cy=browse]').trigger('mouseover');
        cy.findByRole('button', { name: 'Dashboards' }).click();
        // click on rename
        cy.get('.bp3-button-text').contains('Rename').click();
        cy.get('#name-input').should('have.value', 'Jaffle dashboard');
        cy.get('#name-input').focus().clear();
        cy.get('#name-input').type('updated dashboard', { force: true });
        cy.get('#description-input').type('description', { force: true });

        // click on save
        cy.findByRole('button', { name: 'Save' }).click();

        // verify dashboard name has been updated in the list
        cy.findByText('updated dashboard').should('exist');
    });

    it('Should delete dashboards', () => {
        cy.visit('/');
        cy.get('[data-cy=browse]').trigger('mouseover');
        cy.findByRole('button', { name: 'Dashboards' }).click();
        // click on delete
        cy.get('.bp3-button-text').contains('Delete').click();
        // click on delete in the popup
        cy.get('.bp3-dialog-footer-actions .bp3-button-text')
            .contains('Delete')
            .click();
        cy.findByText('No results available');
    });

    it('Should create a new dashboard', () => {
        cy.visit('/');
        cy.get('[data-cy=browse]').trigger('mouseover');
        cy.findByRole('button', { name: 'Dashboards' }).click();
        cy.findByRole('button', { name: 'New dashboard' }).click();
        cy.get('#name-input').type('Jaffle dashboard', { force: true });
        // click on save
        cy.findByRole('button', { name: 'Create' }).click();
    });
});
