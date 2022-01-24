import { SEED_EMAIL, SEED_PASSWORD } from 'common';

describe('Login', () => {
    beforeEach(() => {
        cy.request({
            url: 'api/v1/logout',
            method: 'GET',
        });
    });
    it('Should login successfully', () => {
        cy.visit('/login');
        cy.findByLabelText('Email *').type(SEED_EMAIL.email);
        cy.findByLabelText('Password *').type(SEED_PASSWORD.password);
        cy.get('[data-cy="login-button"]').click();
        cy.url().should('include', '/home');
    });
    it('Should display error message when credentials are invalid', () => {
        cy.visit('/login');
        cy.findByLabelText('Email *').type('test-email');
        cy.findByLabelText('Password *').type('test-password');
        cy.get('[data-cy="login-button"]').click();
        cy.findByText('Email and password not recognized.').should(
            'be.visible',
        );
    });
    it('Should display error message when one field is empty', () => {
        cy.visit('/login');
        cy.findByLabelText('Email *').type('test-email');
        cy.get('[data-cy="login-button"]').click();
        cy.findByText('Required field').should('be.visible');
    });
});
