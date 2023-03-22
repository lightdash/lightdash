import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';

describe('Login', () => {
    beforeEach(() => {
        cy.logout();
    });
    it('Should login successfully', () => {
        cy.logout();
        cy.visit('/login');
        cy.findByPlaceholderText('Your email address').type(
            SEED_ORG_1_ADMIN_EMAIL.email,
        );
        cy.findByPlaceholderText('Your password').type(
            SEED_ORG_1_ADMIN_PASSWORD.password,
        );
        cy.get('form').findByText('Sign in').click();
        cy.url().should('include', '/home');
    });
    it('Should display error message when credentials are invalid', () => {
        cy.logout();
        cy.visit('/login');
        cy.findByPlaceholderText('Your email address').type('test-email');
        cy.findByPlaceholderText('Your password').type('test-password');
        cy.get('form').findByText('Sign in').click();
        cy.findByText('Email and password not recognized').should('be.visible');
    });
    it('Should display error message when one field is empty', () => {
        cy.logout();
        cy.visit('/login');
        cy.findByPlaceholderText('Your email address').type('test-email');
        cy.get('form').findByText('Sign in').click();
        cy.findByText('Required field').should('be.visible');
    });
});
