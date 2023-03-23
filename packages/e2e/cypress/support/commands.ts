// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_ORG_2_ADMIN_EMAIL,
    SEED_ORG_2_ADMIN_PASSWORD,
} from '@lightdash/common';
import '@testing-library/cypress/add-commands';
import 'cypress-file-upload';

declare global {
    namespace Cypress {
        interface Chainable {
            login(): Chainable<Element>;
            anotherLogin(): Chainable<Element>;
            logout(): Chainable<Element>;
            registerNewUser(): Chainable<Element>;
            invite(email, role): Chainable<string>;
            registerWithCode(email, inviteCode): Chainable<Element>;
            verifyEmail(): Chainable<Element>;
            addProjectPermission(email, role, projectUuid): Chainable<Element>;
            loginWithPermissions(
                orgRole,
                projectPermissions,
            ): Chainable<Element>;
            loginWithEmail: (email) => Chainable<Element>;
            getApiToken(): Chainable<string>;
        }
    }
}

Cypress.Commands.add('login', () => {
    cy.session(
        SEED_ORG_1_ADMIN_EMAIL.email,
        () => {
            cy.request({
                url: 'api/v1/login',
                method: 'POST',
                body: {
                    email: SEED_ORG_1_ADMIN_EMAIL.email,
                    password: SEED_ORG_1_ADMIN_PASSWORD.password,
                },
            })
                .its('status')
                .should('eq', 200);
        },
        {
            validate() {
                cy.request('api/v1/user').its('status').should('eq', 200);
            },
        },
    );
});

Cypress.Commands.add('anotherLogin', () => {
    cy.session(
        SEED_ORG_2_ADMIN_EMAIL.email,
        () => {
            cy.request({
                url: 'api/v1/login',
                method: 'POST',
                body: {
                    email: SEED_ORG_2_ADMIN_EMAIL.email,
                    password: SEED_ORG_2_ADMIN_PASSWORD.password,
                },
            })
                .its('status')
                .should('eq', 200);
        },
        {
            validate() {
                cy.request('api/v1/user').its('status').should('eq', 200);
            },
        },
    );
});
Cypress.Commands.add('registerNewUser', () => {
    const email = `demo+${new Date().getTime()}@lightdash.com`;
    cy.request({
        url: 'api/v1/register',
        method: 'POST',
        body: {
            firstName: 'Test',
            lastName: 'e2e',
            email,
            password: 'demo_password!',
        },
    });
});

Cypress.Commands.add(
    'registerWithCode',
    (email: string, inviteCode: string) => {
        cy.request({
            url: `api/v1/user`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {
                inviteCode,
                email,
                firstName: 'test',
                lastName: 'test',
                password: 'test',
            },
        }).then((resp) => {
            cy.log(JSON.stringify(resp.body));
            expect(resp.status).to.eq(200);
        });
    },
);

Cypress.Commands.add('verifyEmail', () => {
    cy.request({
        url: `api/v1/user/me/email/status?passcode=000000`,
        headers: { 'Content-type': 'application/json' },
        method: 'GET',
        body: undefined,
    }).then((resp) => {
        cy.log(JSON.stringify(resp.body));
        expect(resp.status).to.eq(200);
    });
});

Cypress.Commands.add('invite', (email: string, role: string) => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // in 1 day

    cy.request({
        url: `api/v1/invite-links`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            role,
            email,
            expiresAt,
        },
    }).then((resp) => {
        cy.log(JSON.stringify(resp.body.results));
        expect(resp.status).to.eq(201);
        cy.wrap(resp.body.results.inviteCode);
    });
});

Cypress.Commands.add(
    'addProjectPermission',
    (email: string, role: string, projectUuid: string) => {
        cy.request({
            url: `api/v1/projects/${projectUuid}/access`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {
                role,
                email,
            },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    },
);

Cypress.Commands.add('logout', () => {
    cy.request({
        url: 'api/v1/logout',
        method: 'GET',
    });
});

type ProjectPermission = {
    role: string;
    projectUuid: string;
};
Cypress.Commands.add(
    'loginWithPermissions',
    (orgRole: string, projectPermissions: ProjectPermission[]) => {
        cy.login();

        const email = `demo+${orgRole}-${new Date().getTime()}@lightdash.com`;

        cy.invite(email, orgRole).then((inviteCode) => {
            projectPermissions.forEach((projectPermission) => {
                cy.addProjectPermission(
                    email,
                    projectPermission.role,
                    projectPermission.projectUuid,
                );
            });

            cy.registerWithCode(email, inviteCode);
            cy.verifyEmail();
            cy.wrap(email);
        });
    },
);

Cypress.Commands.add('loginWithEmail', (email: string) => {
    cy.session(
        email,
        () => {
            cy.request({
                url: 'api/v1/login',
                method: 'POST',
                body: {
                    email,
                    password: 'test',
                },
            })
                .its('status')
                .should('eq', 200);
        },
        {},
    );
});
Cypress.Commands.add('getApiToken', () => {
    cy.request({
        url: `api/v1/user/me/personal-access-tokens`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            description: 'e2e',
            autoGenerated: false,
        },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
        cy.wrap(resp.body.results.token, { log: false });
    });
});
