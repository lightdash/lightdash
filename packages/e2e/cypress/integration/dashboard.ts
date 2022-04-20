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

    it('Should see dasbhoard', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);

        cy.findByText('Jaffle dashboard').click();

        cy.find('No chart available').should('not.exist');
    });
});
