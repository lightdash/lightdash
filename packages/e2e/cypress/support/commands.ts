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

declare global {
    namespace Cypress {
        interface Chainable {
            login(): Chainable<Element>;
            anotherLogin(): Chainable<Element>;
            logout(): Chainable<Element>;
            registerNewUser(): Chainable<Element>;
        }
    }
}

Cypress.Commands.add('login', () => {
    cy.request({
        url: 'api/v1/login',
        method: 'POST',
        body: {
            email: SEED_ORG_1_ADMIN_EMAIL.email,
            password: SEED_ORG_1_ADMIN_PASSWORD.password,
        },
    });
});

Cypress.Commands.add('anotherLogin', () => {
    cy.request({
        url: 'api/v1/login',
        method: 'POST',
        body: {
            email: SEED_ORG_2_ADMIN_EMAIL.email,
            password: SEED_ORG_2_ADMIN_PASSWORD.password,
        },
    });
});
Cypress.Commands.add('registerNewUser', () => {
    const email = `test+${new Date().getTime()}@lightdash.com`;
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

Cypress.Commands.add('logout', () => {
    cy.request({
        url: 'api/v1/logout',
        method: 'GET',
    });
});
