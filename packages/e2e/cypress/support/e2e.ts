// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************
/// <reference types="cypress" />

import './commands';

declare global {
    namespace Cypress {
        interface Chainable {
            login(): Chainable<Element>;
            anotherLogin(): Chainable<Element>;
            logout(): Chainable<Element>;
            registerNewUser(): Chainable<Element>;
            preCompileProject(): Chainable<Element>;
        }
    }
}

beforeEach(() => {
    // Block some external URLs
    const ignoredUrls = [
        'static.cohere.so',
        'cdn.headwayapp.co',
        'chat.lightdash.com',
        'www.loom.com',
        'analytics.lightdash.com',
    ];
    ignoredUrls.forEach((url) => {
        cy.intercept(
            {
                hostname: url,
            },
            (req) => {
                req.destroy();
            },
        ).as('intercept');
    });
});
