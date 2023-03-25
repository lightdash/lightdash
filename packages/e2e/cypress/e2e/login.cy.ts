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
        cy.get('[data-cy="signin-button"]').click();
        cy.url().should('include', '/home');
    });
    it('Should display error message when email is invalid', () => {
        cy.logout();
        cy.visit('/login');
        cy.findByPlaceholderText('Your email address').type('test-email');
        cy.findByPlaceholderText('Your password').type('test-password');
        cy.get('[data-cy="signin-button"]').click();
        cy.findByText('Your email address is not valid').should('be.visible');
    });
    it('Should display error message when credentials are invalid', () => {
        cy.logout();
        cy.visit('/login');
        cy.findByPlaceholderText('Your email address').type('test@emaill.com');
        cy.findByPlaceholderText('Your password').type('test-password');
        cy.get('[data-cy="signin-button"]').click();
        cy.findByText('Email and password not recognized').should('be.visible');
    });
    // FIXME: Please fill out this field is a tooltip and Cy can't find it on the UI
    // it('Should display error message when one field is empty', () => {
    //     cy.logout();
    //     cy.visit('/login');
    //     cy.findByPlaceholderText('Your email address').type('test@mail.com');
    //     cy.get('[data-cy="signin-button"]').click();
    //     cy.findByText('Please fill out this field.').should('be.visible');
    // });
});
