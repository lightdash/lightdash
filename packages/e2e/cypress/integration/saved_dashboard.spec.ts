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
        cy.get('#browse').trigger('mouseover')
        cy.get('.browse-menu > li').eq(0).click();
        cy.get('h5').should('have.text', 'Jaffle dashboard');
    });


    it('Should update dashboards', () => {
        // click on rename
        cy.get('.bp3-button-group > button').eq(1).click();
        cy.get('#name-input').should('have.value', 'Jaffle dashboard');
        cy.get('#name-input').focus().clear();
        cy.get('#name-input').type('updated dashboard', { force: true });
        cy.get('#description-input').type('description', { force: true });

        // click on save
        cy.get('.bp3-dialog-footer-actions > button').eq(1).click();

        // verify dashboard name has been updated in the list
        cy.get('h5').should('have.text', 'updated dashboard');
    });


    it('Should delete dashboards', () => {
        // click on delete
        cy.get('.bp3-button-group > button').eq(2).click();
        // click on delete in the popup
        cy.get('.bp3-dialog-footer-actions > button').eq(1).click();
        cy.findByText('No results available').click();
    })

    it('Should create a new dashboard', () => {
        cy.contains('.bp3-button', 'New dashboard').click();
        cy.get('#name-input').type('Jaffle dashboard', { force: true });
        // click on save
        cy.get('.bp3-dialog-footer-actions > button').eq(1).click();
    })

});
