import { USER_SEED } from 'common';

describe('Login', () => {

    it('Should login successfully =', () => {
        cy.visit('/login');
        cy.get('[data-cy="email"]').type(USER_SEED.email);
        cy.get('[ data-cy="password"]').type(USER_SEED.password);
        cy.get('[data-cy="login-button"]').click();
        cy.url().should('include', '/tables')
    });
    it('Should display error message when credentials are invalid', () => {
        cy.visit('/login');
        cy.get('[data-cy="email"]').type("test-email");
        cy.get('[ data-cy="password"]').type("test-password");
        cy.get('[data-cy="login-button"]').click();
        cy.findByText('Email and password not recognized.').should('be.visible')
    });
    it('Should display error message when one field is empty', () => {
        cy.visit('/login');
        cy.get('[data-cy="email"]').type("test-email");
        cy.get('[data-cy="login-button"]').click();
        cy.findByText('Required fields: email and password').should('be.visible')
    });
});