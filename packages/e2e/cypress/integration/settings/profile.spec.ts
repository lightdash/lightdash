import { USER_SEED } from 'common';

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
                firstName: USER_SEED.firstName,
                lastName: USER_SEED.lastName,
                email: USER_SEED.email,
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
        cy.findByText('User updated with success').should('be.visible');
        cy.visit('/');
        cy.get('[data-cy="heading-username"]').should('contain', 'Kevin Space');
    });
});
