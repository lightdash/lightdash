import { SEED_ORG_1_ADMIN, SEED_ORG_1_ADMIN_EMAIL } from '@lightdash/common';

describe('Settings - Profile', () => {
    beforeEach(() => {
        cy.login();
    });

    after(() => {
        // Reset to default values
        cy.request({
            url: 'api/v1/user/me',
            method: 'PATCH',
            body: {
                firstName: SEED_ORG_1_ADMIN.first_name,
                lastName: SEED_ORG_1_ADMIN.last_name,
                email: SEED_ORG_1_ADMIN_EMAIL.email,
            },
        });
    });

    it('should update user names', () => {
        cy.visit('/');
        cy.findByTestId('user-avatar').click();
        cy.findByRole('menuitem', { name: 'User settings' }).click();

        cy.findByPlaceholderText('First name')
            .should('not.be.disabled')
            .should('have.value', SEED_ORG_1_ADMIN.first_name);
        cy.findByPlaceholderText('Last name')
            .should('not.be.disabled')
            .should('have.value', SEED_ORG_1_ADMIN.last_name);
        cy.findByPlaceholderText('Email')
            .should('not.be.disabled')
            .should('have.value', SEED_ORG_1_ADMIN_EMAIL.email);

        cy.findByPlaceholderText('First name')
            .focus()
            .clear()
            .should('have.value', '');
        cy.findByPlaceholderText('First name').type('Kevin');
        cy.findByPlaceholderText('Last name')
            .focus()
            .clear()
            .should('have.value', '');
        cy.findByPlaceholderText('Last name').type('Space');

        cy.findByRole('button', { name: 'Update' }).click();

        cy.findByText('Success! User details were updated.').should(
            'be.visible',
        );

        cy.visit('/');
        cy.findByTestId('user-avatar').should('contain', 'KS');
    });
});
