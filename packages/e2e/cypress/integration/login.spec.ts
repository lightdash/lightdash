import { SEED_EMAIL, SEED_PASSWORD } from 'common';

describe('Login', () => {
    it('Should login successfully', () => {
        cy.visit('/login');
        cy.findByLabelText('Email (required)').type(SEED_EMAIL.email);
        cy.findByLabelText('Password (required)').type(SEED_PASSWORD.password);
        cy.get('[data-cy="login-button"]').click();
        cy.url().should('include', '/tables');
    });
    it('Should display error message when credentials are invalid', () => {
        cy.visit('/login');
        cy.findByLabelText('Email (required)').type('test-email');
        cy.findByLabelText('Password (required)').type('test-password');
        cy.get('[data-cy="login-button"]').click();
        cy.findByText('Email and password not recognized.').should(
            'be.visible',
        );
    });
    it('Should display error message when one field is empty', () => {
        cy.visit('/login');
        cy.findByLabelText('Email (required)').type('test-email');
        cy.get('[data-cy="login-button"]').click();
        cy.findByText('Required field').should('be.visible');
    });
});
