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

// Hide all requests from
const cypressLogOriginal = Cypress.log;

// @ts-ignore
Cypress.log = function name(opts, ...other) {
    const isFetchLog = opts.displayName && ['fetch'].includes(opts.displayName);
    if (isFetchLog) return;
    // eslint-disable-next-line consistent-return
    return cypressLogOriginal(opts, ...other);
};
