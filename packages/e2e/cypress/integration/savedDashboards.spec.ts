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
        cy.findByText('Jaffle dashboard').should('exist');
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

        cy.url().should(
            'match',
            new RegExp(
                /.*\/projects\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/dashboards\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
            ),
        );
        cy.findByText('Untitled dashboard').should('exist');
    });

    it('Should update dashboards', () => {
        cy.visit('/');
        cy.get('[data-cy=browse]').trigger('mouseover');
        cy.findByRole('button', { name: 'Dashboards' }).click();
        // click on rename
        cy.findByRole('button', { name: 'edit Rename' }).click();
        cy.findByLabelText('Name (required)').clear().type('Jaffle dashboard');
        cy.findByLabelText('Description (optional)')
            .clear()
            .type('description');
        // click on save
        cy.findByRole('button', { name: 'Save' }).click();

        // verify dashboard name has been updated in the list
        cy.findByText('Jaffle dashboard').should('exist');
    });
});
