import { SEED_PROJECT } from '@lightdash/common';

describe('Global search', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Should search all result types', () => {
        // Search requests are debounced, so take that into account when waiting for the search request to complete
        const SEARCHED_QUERIES = new Set<string>();

        function search(query: string) {
            const hasPerformedSearch = SEARCHED_QUERIES.has(query);
            cy.findByRole('search').click();

            if (!hasPerformedSearch) {
                SEARCHED_QUERIES.add(query);
                cy.intercept('**/search/**').as('search');
            }

            cy.findByPlaceholderText(/Search Jaffle shop/gi)
                .clear()
                .type(query);

            if (!hasPerformedSearch) {
                cy.wait('@search');
            }
        }
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);

        cy.contains('Search Jaffle shop').should('be.visible');
        // search and select space
        search('jaffle');
        cy.findByRole('dialog')
            .findByRole('menuitem', { name: 'Jaffle shop' })
            .scrollIntoView()
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/spaces/`,
        );
        cy.contains('Spaces').should('be.visible');

        // search and select dashboard
        search('jaffle');
        cy.findByRole('dialog')
            .findAllByRole('menuitem', { name: /Jaffle dashboard/ })
            .first()
            .scrollIntoView()
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/`,
        );
        cy.contains('Jaffle dashboard').should('be.visible');

        // search and select saved chart
        search('Which');
        cy.findByRole('dialog')
            .findByRole('menuitem', {
                name: /Which customers have not recently ordered an item/,
            })
            .scrollIntoView()
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/saved/`,
        );

        //  wait for table to render
        cy.findAllByText('Customer id').should('have.length', 1);

        // search and select table
        search('Customers');
        cy.findByRole('dialog')
            .findByRole('menuitem', {
                name: /^Customers Table · # Customers/,
            })
            .scrollIntoView()
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/tables/customers`,
        );
        cy.contains('Customer id').should('be.visible');

        // search and select field
        search('Date of first order');
        cy.findByRole('dialog')
            .findByRole('menuitem', {
                name: 'Orders - Date of first order Metric · Min of Order date',
            })
            .scrollIntoView()
            .click();
        cy.url().should(
            'include',
            `/projects/${SEED_PROJECT.project_uuid}/tables/orders?create_saved_chart_version`,
        );
    });
});
