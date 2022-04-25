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

import './commands';

before(() => {
    // Block some external URLs
    [
        'static.cohere.so',
        'cdn.headwayapp.co',
        'chat.lightdash.com',
        'www.loom.com',
    ].forEach((url) => {
        cy.intercept(
            {
                hostname: url,
            },
            (req) => {
                req.destroy();
            },
        );
    });
});
