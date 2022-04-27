import { SEED_PROJECT } from 'common';

describe('Dashboard', () => {
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

        cy.findByText("What's our total revenue to date?");
        cy.findByText("What's the average spend per customer?");

        cy.findAllByText('Loading chart').should('have.length', 0); // Finish loading

        cy.findAllByText('No chart available').should('have.length', 0);
        cy.findAllByText('No data available').should('have.length', 0);

        cy.get('.echarts-for-react').should('have.length', 3); // Charts
        cy.contains('Payments total revenue'); // BigNumber chart
        cy.get('th').should('have.length', 3); // Table chart
    });
});
