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
        cy.visit('/projects');

        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Unique order count').click();
        cy.get('th').findByText('First name').click();
        cy.get('td', { timeout: 10000 }).first().should('have.text', 'Aaron');
    });
});
