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
        cy.get('[data-cy="first-name-input"]').should(
            'have.value',
            SEED_ORG_1_ADMIN.first_name,
        ); // wait for form to populate
        cy.get('[data-cy="first-name-input"]').clear();
        cy.get('[data-cy="first-name-input"]').type('Kevin');
        cy.get('[data-cy="last-name-input"]').clear();
        cy.get('[data-cy="last-name-input"]').type('Space');
        cy.get('[data-cy="update-profile-settings"]').click();
        cy.findByText('Success! User details were updated.').should(
            'be.visible',
        );
        cy.visit('/');
        cy.findByTestId('user-avatar').should('contain', 'KS');
    });
});
