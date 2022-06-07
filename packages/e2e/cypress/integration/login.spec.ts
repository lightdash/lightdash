import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';

describe('Login', () => {
    beforeEach(() => {
        // @ts-ignore
        cy.logout();
    });
    it('Should login successfully', () => {
        cy.visit('/login');
        cy.findByLabelText('Email address *').type(
            SEED_ORG_1_ADMIN_EMAIL.email,
        );
        cy.findByLabelText('Password *').type(
            SEED_ORG_1_ADMIN_PASSWORD.password,
        );
        cy.get('[data-cy="login-button"]').click();
        cy.url().should('include', '/home');
    });
    it('Should display error message when credentials are invalid', () => {
        cy.visit('/login');
        cy.findByLabelText('Email address *').type('test-email');
        cy.findByLabelText('Password *').type('test-password');
        cy.get('[data-cy="login-button"]').click();
        cy.findByText('Email and password not recognized.').should(
            'be.visible',
        );
    });
    it('Should display error message when one field is empty', () => {
        cy.visit('/login');
        cy.findByLabelText('Email address *').type('test-email');
        cy.get('[data-cy="login-button"]').click();
        cy.findByText('Required field').should('be.visible');
    });
});
