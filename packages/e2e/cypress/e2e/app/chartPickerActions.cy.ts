import { SEED_PROJECT } from '@lightdash/common';

describe('Chart picker actions', () => {
    it('replaces only the selected chart title with its configuration action', () => {
        cy.login();
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        cy.findByTestId('page-spinner').should('not.exist');
        cy.scrollTreeToItem('Unique order count');
        cy.findByText('Unique order count').click();
        cy.get('table').should('contain.text', 'Unique order count');
        cy.findByRole('button', { name: 'Configure', exact: true }).click();
        cy.findByRole('button', { name: 'Change', exact: true }).click();

        cy.findByRole('button', { name: 'Pie chart', exact: true }).click();
        cy.findByRole('button', { name: 'Pie chart', pressed: true }).should(
            'exist',
        );
        cy.findByText('Choose chart type').should('be.visible');
        cy.findByRole('button', {
            name: 'Configure Bar chart',
            exact: true,
        }).should('not.exist');
        cy.findByRole('button', { name: 'Configure Pie chart', exact: true })
            .focus()
            .should('be.visible')
            .should(($button) => {
                const button = $button[0];
                const title = button.parentElement!.querySelector('p')!;
                expect(getComputedStyle(title).opacity).to.eq('0');
                expect(button.getBoundingClientRect().top).to.be.lessThan(
                    title.getBoundingClientRect().bottom,
                );
                const icon = title.previousElementSibling!;
                expect(getComputedStyle(icon).opacity).to.eq('1');
            })
            .click();
        cy.findByRole('button', { name: 'Change', exact: true }).should(
            'have.focus',
        );
        cy.findByText('Choose chart type').should('not.exist');
        cy.findByText('Pie chart', { exact: true }).should('be.visible');
    });
});
