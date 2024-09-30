import { SEED_PROJECT } from '@lightdash/common';

const firstCustomer = {
    firstName: 'Michael',
    lastName: 'P.',
    created: '2017-01-30T06:00:00.000Z',
};
describe('SQL Runner', () => {
    beforeEach(() => {
        cy.login();
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/sqlRunner`);
    });

    it('Should see results from customers by typing', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/sqlRunner`);

        cy.contains('SQL');

        const customersTable = `"jaffle"."customers"`;

        cy.get('.ace_content').type(
            `SELECT * FROM ${customersTable} order by customer_id LIMIT 1`,
        );

        cy.contains('Run query').click();

        const find = [
            'First name',
            firstCustomer.created,
            firstCustomer.firstName,
            firstCustomer.lastName,
        ];
        find.forEach((text) => cy.findByText(text));
    });

    it('Should autocomplete customer table', () => {
        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/sqlRunner`);

        cy.contains('SQL');

        cy.get('.ace_content').type(
            `SELECT * FROM cu{enter} order by customer_id`,
        );

        cy.contains('Run query').click();

        const find = [
            'First name',
            firstCustomer.created,
            firstCustomer.firstName,
            firstCustomer.lastName,
            'Shawn', // customer_id = 2
        ];
        find.forEach((text) => cy.findAllByText(text));
        cy.contains('Page 1 of 11');
    });

    it('Should see results from orders by clicking', () => {
        cy.findByText('payments').click();
        cy.findAllByText('Run query').first().click();

        const find = ['Payment method', 'bank_transfer', 'credit_card'];
        find.forEach((text) => cy.findAllByText(text));
        cy.contains('Page 1 of 3');
    });

    it('Get error on invalid SQL', () => {
        cy.contains('SQL');
        cy.get('.ace_content').type(`SELECT test`);
        cy.contains('Run query').click();

        cy.findByText('Failed to run sql query');
        cy.contains('column "test" does not exist');
    });

    it('Should see results with custom SQL ', () => {
        cy.contains('SQL');
        const sql = `select a from ( values ('foo'), ('bar')) s(a);`;

        cy.get('.ace_content').type(sql);
        cy.contains('Run query').click();
    });
});
