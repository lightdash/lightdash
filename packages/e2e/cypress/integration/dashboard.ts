import { SEED_PROJECT } from 'common';

describe('Explore', () => {
    before(() => {
        // @ts-ignore
        cy.login();
        // @ts-ignore
        cy.preCompileProject();

        ['chat.lightdash.com', 'www.loom.com'].forEach((url) => {
            cy.intercept(
                {
                    hostname: url,
                },
                (req) => {
                    req.destroy();
                },
            );
        });
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should see dasbhoard', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);

        cy.findByText('Jaffle dashboard').click();

        cy.findAllByText('No chart available').should('have.length', 0);
        cy.findAllByText('No data available').should('have.length', 0);
    });
});
