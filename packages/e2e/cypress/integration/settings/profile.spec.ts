import { SEED_EMAIL, SEED_USER } from 'common';

describe('Settings - Profile', () => {
    before(() => {
        // @ts-ignore
        cy.login();
    });

    after(() => {
        // Reset to default values
        cy.request({
            url: 'api/v1/user/me',
            method: 'PATCH',
            body: {
                firstName: SEED_USER.first_name,
                lastName: SEED_USER.last_name,
                email: SEED_EMAIL.email,
            },
        });
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
    });

    it('Should change name and email', () => {
        cy.visit('/');
        cy.get('[data-cy="settings-button"]').click();
        cy.get('[data-cy="first-name-input"]').clear().type('Kevin');
        cy.get('[data-cy="last-name-input"]').clear().type('Space');
        cy.get('[data-cy="email-input"]').clear().type('kspace@lightdash.com');
        cy.get('[data-cy="update-profile-settings"]').click();
        cy.findByText('Success! User details were updated.').should(
            'be.visible',
        );
        cy.visit('/');
        cy.get('[data-cy="user-avatar"]').should('contain', 'KS');
    });
});
