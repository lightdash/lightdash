import { SEED_ORG_1_ADMIN, SEED_ORG_1_ADMIN_EMAIL } from '@lightdash/common';

const resetUserName = () => {
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
};

describe('Settings - Profile', () => {
    beforeEach(() => {
        cy.login();

        resetUserName();
    });
    afterEach(() => {
        resetUserName();
    });

    it('should update user names', () => {
        cy.visit('/');
        cy.findByTestId('user-avatar').click();
        cy.findByRole('menuitem', { name: 'User settings' }).click();

        cy.findByPlaceholderText('Email')
            .should('not.be.disabled')
            .should('have.value', SEED_ORG_1_ADMIN_EMAIL.email);

        cy.wait(500);
        cy.findByPlaceholderText('First name')
            .should('not.be.disabled')
            .should('have.value', SEED_ORG_1_ADMIN.first_name)
            .click()
            .clear()
            .type('Kevin')
            .blur();
        cy.wait(500); // Add wait here to prevent flakiness when typing in different inputs.
        cy.findByPlaceholderText('Last name')
            .should('not.be.disabled')
            .should('have.value', SEED_ORG_1_ADMIN.last_name)
            .click()
            .clear()
            .type('Space')
            .blur();
        cy.wait(500);

        cy.findByRole('button', { name: 'Update' }).click();

        cy.findByText('Success! User details were updated.').should(
            'be.visible',
        );

        cy.visit('/');
        cy.findByTestId('user-avatar').should('contain', 'KS');
    });
});
