describe('Explore', () => {
    it('Should query orders', () => {
        cy.visit('/');

        // Close query dev tools
        cy.get('body').then((body) => {
            if (body.find('.ReactQueryDevtools').length > 0) {
                cy.get('.ReactQueryDevtools')
                    .findByRole('button', { name: /Close/i })
                    .click();
            }
        });
        cy.findByText('Orders').click();
        cy.findByText('First name').click();
        cy.findByText('Total orders').click();
        cy.get('th').findByText('First name').click();
        cy.findAllByRole('button', { name: /Run query/i })
            .first()
            .click();
        cy.findByText('Loading results', { timeout: 10000 }).should(
            'not.exist',
        );
        cy.get('td').first().should('have.text', 'Aaron');
    });
});
