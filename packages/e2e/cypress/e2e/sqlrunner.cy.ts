import { SEED_PROJECT } from '@lightdash/common';

const firstCustomer = {
    firstName: 'Michael',
    lastName: 'P.',
    created: '2017-01-30T06:00:00.000Z',
};
describe('SQL Runner', () => {
    before(() => {
        cy.login();
    });

    beforeEach(() => {
        Cypress.Cookies.preserveOnce('connect.sid');
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/sqlRunner`);
    });

    it('Should see results from customers by typing', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/sqlRunner`);

        const customersTable = `"jaffle"."customers"`;

        cy.get('.ace_content')
            .type(
                `SELECT * FROM ${customersTable} order by customer_id LIMIT 1`,
            )
            .type('{ctrl}{enter}');

        const find = [
            '1 result',
            'First name',
            firstCustomer.created,
            firstCustomer.firstName,
            firstCustomer.lastName,
        ];
        find.forEach((text) => cy.findByText(text));
    });

    it('Should autocomplete customer table', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/sqlRunner`);

        cy.get('.ace_content')
            .type(`SELECT * FROM cu\n order by customer_id`)
            .type('{ctrl}{enter}');

        const find = [
            'First name',
            firstCustomer.created,
            firstCustomer.firstName,
            firstCustomer.lastName,
            'Shawn', // customer_id = 2
        ];
        find.forEach((text) => cy.findAllByText(text));
        cy.contains('Page 1 of 10');
    });

    it('Should see results from orders by clicking', () => {
        cy.findByText('payments').click();
        cy.findAllByText('Run query').first().click();

        const find = ['Payment method', 'bank_transfer', 'credit_card'];
        find.forEach((text) => cy.findAllByText(text));
        cy.contains('Page 1 of 3');
    });

    it('Get error on invalid SQL', () => {
        cy.get('.ace_content').type(`SELECT test`).type('{ctrl}{enter}');

        cy.findByText('Failed to run sql query');
        cy.contains('column "test" does not exist');
    });

    it('Should see results with custom SQL ', () => {
        const sql = `select a from ( values ('foo'), ('bar')) s(a);`;

        cy.get('.ace_content').type(sql).type('{ctrl}{enter}');

        const find = ['2 results'];
        find.forEach((text) => cy.findAllByText(text));
    });
});
