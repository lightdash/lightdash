import { SEED_PROJECT } from '@lightdash/common';

function search(query: string) {
    cy.findByPlaceholderText('Search...').click();
    cy.get('.bp4-omnibar').find('input').clear().type(query);
}

describe('Global search', () => {
    before(() => {
        cy.login();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should search all result types', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);

        // search and select space
        search('jaffle');
        cy.get('.bp4-omnibar')
            .findByRole('menuitem', { name: 'Jaffle shop' })
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/spaces/`,
        );

        // search and select dashboard
        search('jaffle');
        cy.get('.bp4-omnibar')
            .findByRole('menuitem', { name: 'Jaffle dashboard' })
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/`,
        );

        // search and select saved chart
        search('Which');
        cy.get('.bp4-omnibar')
            .findByRole('menuitem', {
                name: 'Which customers have not recently ordered an item?A table of the 20 customers that least recently placed an order with us',
            })
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/saved/`,
        );

        // search and select table
        search('Customers');
        cy.get('.bp4-omnibar')
            .findByRole('menuitem', {
                name: "Customers - CustomersThis table has basic information about a customer, as well as some derived facts based on a customer's orders",
            })
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/tables/customers`,
        );

        // search and select field
        search('First order');
        cy.get('.bp4-omnibar')
            .findByRole('menuitem', {
                name: 'Customers - Customers - First orderDate of the customers first order',
                exact: false,
            })
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/tables/customers?create_saved_chart_version`,
        );
    });
});
