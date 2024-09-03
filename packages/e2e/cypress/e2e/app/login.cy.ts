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
        cy.findByText('Continue').click();
        cy.findByPlaceholderText('Your password').type(
            SEED_ORG_1_ADMIN_PASSWORD.password,
        );
        cy.get('[data-cy="signin-button"]').click();
        cy.url().should('include', '/home');
    });

    it.only('Should display error message when credentials are invalid or not recognised', () => {
        cy.logout();
        cy.visit('/login');
        cy.findByPlaceholderText('Your email address').type('test-email');
        cy.findByText('Continue').click();
        cy.findByText('Email address is not valid').should('be.visible');
        cy.findByPlaceholderText('Your email address')
            .clear()
            .type('test@email.com ');
        cy.findByText('Continue').click();
        cy.findByText('Email address must not contain whitespaces').should(
            'be.visible',
        );
        cy.findByPlaceholderText('Your email address')
            .clear()
            .type('test@emaill.com');
        cy.findByText('Continue').click();
        cy.findByPlaceholderText('Your password').clear().type('test-password');
        cy.get('[data-cy="signin-button"]').click();
        cy.findByText('Email and password not recognized').should('be.visible');
    });
});
