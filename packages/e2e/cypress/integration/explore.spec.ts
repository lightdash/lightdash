describe('Explore', () => {
    before(() => {
        // @ts-ignore
        cy.login();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should query orders', () => {
        cy.visit('/');

        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Total orders').click();
        cy.get('th').findByText('First name').click();
        cy.findAllByRole('button', { name: /Run query/i })
            .first()
            .click();
        cy.get('td', { timeout: 10000 }).first().should('have.text', 'Aaron');
    });
});
