import { SEED_PROJECT } from '@lightdash/common';

describe('Chart picker actions', () => {
    it('keeps the selected chart title above its visible configuration action', () => {
        cy.login();
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/tables/orders`);
        cy.findByTestId('page-spinner').should('not.exist');
        cy.scrollTreeToItem('Unique order count');
        cy.findByText('Unique order count').click();
        cy.scrollTreeToItem('Order Customer');
        cy.findByText('Order Customer').click();
        cy.scrollTreeToItem('First name');
        cy.findByText('First name').click();
        cy.get('table').should('contain.text', 'Unique order count');
        cy.get('button').contains('Run query').click();
        cy.findByTestId('Chart-card-expand').click();
        cy.findByRole('button', { name: 'Configure', exact: true }).click();
        cy.findByRole('button', {
            name: 'Change chart type',
            exact: true,
        }).click();

        cy.contains('button', /^Pie chart$/, { timeout: 30_000 })
            .should('be.enabled')
            .click();
        cy.findByRole('button', { name: 'Pie chart', pressed: true }).should(
            'exist',
        );
        cy.findByText('Choose chart type').should('be.visible');
        cy.findByRole('button', {
            name: 'Configure Bar chart',
            exact: true,
        }).should('not.exist');
        cy.findByRole('button', { name: 'Configure Pie chart', exact: true })
            .should('be.visible')
            .focus()
            .should('be.visible')
            .should(($button) => {
                const button = $button[0];
                const title = button.parentElement!.querySelector('p')!;
                expect(getComputedStyle(title).opacity).to.eq('1');
                expect(button.getBoundingClientRect().top).to.be.at.least(
                    title.getBoundingClientRect().bottom,
                );
                const icon = title.parentElement!.previousElementSibling!;
                expect(getComputedStyle(icon).opacity).to.eq('1');
            });
        cy.findByRole('button', { name: 'Pie chart', pressed: true }).click(
            'top',
        );
        cy.findByRole('button', {
            name: 'Change chart type',
            exact: true,
        }).should('have.focus');
        cy.findByText('Choose chart type').should('not.exist');
        cy.findByText('Pie chart', { exact: true }).should('be.visible');

        cy.findByRole('button', {
            name: 'Change chart type',
            exact: true,
        }).click();
        cy.findByRole('button', { name: 'Line chart', pressed: false }).should(
            'exist',
        );
        cy.contains('button', /^Line chart$/, { timeout: 30_000 })
            .should('be.enabled')
            .click('top');
        cy.findByRole('button', { name: 'Line chart', pressed: true }).click(
            'top',
        );
        cy.findByRole('button', {
            name: 'Change chart type',
            exact: true,
        }).should('have.focus');
        cy.findByText('Choose chart type').should('not.exist');
        cy.findByText('Line chart', { exact: true }).should('be.visible');
    });
});
