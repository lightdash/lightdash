describe('Settings - Profile', () => {
    const email = `profile-${Date.now()}-${Cypress._.random(1_000_000)}@lightdash.com`;
    let userUuid: string | null = null;

    before(() => {
        cy.login();
        cy.request({
            url: '/api/v1/invite-links',
            method: 'POST',
            body: {
                email,
                role: 'member',
                expiresAt: new Date(
                    Date.now() + 24 * 60 * 60 * 1000,
                ).toISOString(),
            },
        }).then(({ status, body }) => {
            expect(status).to.eq(201);
            userUuid = body.results.userUuid;
            cy.registerWithCode(body.results.inviteCode);
            cy.verifyEmail();
        });
        cy.loginWithEmail(email);
        cy.request({
            url: '/api/v1/user/me/complete',
            method: 'PATCH',
            body: {
                jobTitle: 'Engineering',
                enableEmailDomainAccess: false,
                isMarketingOptedIn: false,
                isTrackingAnonymized: false,
            },
        })
            .its('status')
            .should('eq', 200);
    });

    beforeEach(() => {
        cy.loginWithEmail(email);
        cy.request({
            url: '/api/v1/user/me',
            method: 'PATCH',
            body: { firstName: 'test', lastName: 'test' },
        })
            .its('status')
            .should('eq', 200);
    });

    after(() => {
        if (!userUuid) return;
        cy.login();
        cy.request('DELETE', `/api/v1/org/user/${userUuid}`)
            .its('status')
            .should('eq', 200);
    });

    it('should update user names', () => {
        cy.visit('/');
        cy.findByTestId('user-avatar').click();
        cy.findByRole('menuitem', { name: 'User settings' }).click();

        cy.findByPlaceholderText('Email')
            .should('not.be.disabled')
            .should('have.value', email);

        cy.wait(500);
        cy.findByPlaceholderText('First name')
            .should('not.be.disabled')
            .should('have.value', 'test')
            .click()
            .clear()
            .type('Kevin')
            .blur();
        cy.wait(500); // Add wait here to prevent flakiness when typing in different inputs.
        cy.findByPlaceholderText('Last name')
            .should('not.be.disabled')
            .should('have.value', 'test')
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
