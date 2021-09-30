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
import '@testing-library/cypress/add-commands';
import { USER_SEED } from 'common';

declare namespace Cypress {
    interface Chainable<AUTWindow> {
        login(): Chainable<AUTWindow>;
        preCompileProject(): Chainable<AUTWindow>;
    }
}

Cypress.Commands.add('login', () => {
    cy.request({
        url: 'api/v1/login',
        method: 'POST',
        body: {
            email: USER_SEED.email,
            password: USER_SEED.password,
        },
    });
});
Cypress.Commands.add('preCompileProject', () => {
    cy.request({
        url: 'api/v1/login',
        method: 'POST',
        body: {
            email: USER_SEED.email,
            password: USER_SEED.password,
        },
    });
    cy.request({
        url: 'api/v1/org/projects',
        method: 'GET',
    }).then(({ body }) => {
        const project = body.results[0];
        cy.log(
            `Pre-compiling project ${project.name} (${project.projectUuid})`,
        );
        cy.request({
            url: `api/v1/projects/${project.projectUuid}/explores`,
            method: 'GET',
            timeout: 100000,
        });
    });
});
