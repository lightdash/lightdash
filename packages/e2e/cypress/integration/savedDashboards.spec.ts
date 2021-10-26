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
        cy.findByRole('button', { name: 'edit Rename' }).click();
        cy.findByLabelText('Name (required)').should(
            'have.value',
            'Jaffle dashboard',
        );
        cy.findByLabelText('Name (required)').focus().clear();
        cy.findByLabelText('Name (required)').type('updated dashboard');
        cy.findByLabelText('Description (optional)').type('description');
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
        cy.findByRole('button', { name: 'delete Delete' }).click();
        // click on delete in the popup
        cy.get('[data-cy=submit-base-modal]').click();
        cy.findByText('No results available');
    });

    it('Should create a new dashboard', () => {
        cy.visit('/');
        cy.get('[data-cy=browse]').trigger('mouseover');
        cy.findByRole('button', { name: 'Dashboards' }).click();
        cy.findByRole('button', { name: 'New dashboard' }).click();
        cy.findByLabelText('Name (required)').type('Jaffle dashboard');
        // click on save
        cy.findByRole('button', { name: 'Create' }).click();
    });
});
