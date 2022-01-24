describe('Dashboard List', () => {
    beforeEach(() => {
        // @ts-ignore
        cy.login();
        cy.visit('/');
    });

    it('Should invite user', () => {
        cy.get('[data-cy="settings-button"]').click();
        cy.contains('Invites').click();
        cy.get('[data-cy="create-invite-link-button"]').click();
        cy.get('#invite-link-input')
            .should('be.visible')
            .then(($input) => {
                const value = $input.val();
                if (typeof value === 'string') {
                    // @ts-ignore
                    cy.logout();
                    cy.visit(value);
                }
            });
        cy.findByLabelText('First name (required)').type('Mary');
        cy.findByLabelText('Last name (required)').type('Green');
        cy.findByLabelText('Job title (required)').select('Data engineer');
        cy.findByLabelText('Email (required)').type('marygreen@lightdash.com');
        cy.findByLabelText('Password (required)').type('PasswordMary1');
        cy.findByRole('button', { name: 'Create' }).click();
        cy.get('[data-cy="user-avatar"]').should('contain', 'MG');
    });

    it('Should delete user', () => {
        cy.get('[data-cy="settings-button"]').click();
        cy.contains('User management').click();
        cy.findByText('Mary Green')
            .parents('.bp3-card')
            .find('[icon="delete"]')
            .click();
        cy.findByRole('button', { name: 'Delete' }).click();
        cy.findByText('Success! User was deleted.').should('be.visible');
        cy.get('[aria-labelledby="bp3-tab-title_user-settings_userManagement"]')
            .contains('Mary Green')
            .should('not.exist');
    });
});
