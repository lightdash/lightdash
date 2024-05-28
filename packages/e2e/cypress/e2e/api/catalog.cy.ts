import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Lightdash catalog all tables and fields', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should list all tables', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?type=table`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(11);
            const userTable = resp.body.results.find(
                (table) => table.name === 'users',
            );
            expect(userTable).to.eql({
                name: 'users',
                description: 'users table',
                type: 'table',
                joinedTables: [],
                tags: [],
            });
        });
    });

    it('Should list all fields', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?type=field`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.gt(10);

            const dimension = resp.body.results.find(
                (field) =>
                    field.name === 'payment_method' &&
                    field.tableLabel === 'Payments',
            );
            expect(dimension).to.eql({
                name: 'payment_method',
                description: 'Method of payment used, for example credit card',
                tableLabel: 'Payments',
                tableName: 'payments',

                fieldType: 'dimension',
                basicType: 'string',
                type: 'field',
                tags: [],
            });

            const metric = resp.body.results.find(
                (field) =>
                    field.name === 'total_revenue' &&
                    field.tableLabel === 'Payments',
            );
            expect(metric).to.eql({
                name: 'total_revenue',
                description: 'Sum of all payments',
                tableLabel: 'Payments',
                tableName: 'payments',
                fieldType: 'metric',
                basicType: 'number',
                type: 'field',
                tags: [],
            });
        });
    });
});

describe('Lightdash catalog search', () => {
    beforeEach(() => {
        cy.login();
    });
    it('Should search for customer tables and fields', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=customer`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.gt(10);

            const table = resp.body.results.find(
                (t) => t.name === 'customers' && t.type === 'table',
            );

            expect(table).to.eql({
                name: 'customers',
                description:
                    "# Customers\n\nThis table has basic information about a customer, as well as some derived\nfacts based on a customer's orders\n",
                type: 'table',
                tags: [],
            });

            const field = resp.body.results.find(
                (f) => f.name === 'customer_id' && f.tableLabel === 'Users',
            );

            expect(field).to.eql({
                name: 'customer_id',
                tableLabel: 'Users',
                tableName: 'users',
                description: 'This is a unique identifier for a customer',
                type: 'field',
                basicType: 'number',
                fieldType: 'dimension',
                tags: [],
            });
        });
    });
    it('Should search for a dimension (payment_method)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=payment_method`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(2); // payment and stg_payments

            const field = resp.body.results.find(
                (f) =>
                    f.name === 'payment_method' && f.tableLabel === 'Payments',
            );
            expect(field).to.eql({
                name: 'payment_method',
                description: 'Method of payment used, for example credit card',
                tableLabel: 'Payments',
                tableName: 'payments',

                fieldType: 'dimension',
                basicType: 'string',
                type: 'field',
                tags: [],
            });
        });
    });

    it('Should search for a metric (total_revenue)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=revenue`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(1);

            const field = resp.body.results[0];
            expect(field).to.eql({
                name: 'total_revenue',
                description: 'Sum of all payments',
                tableLabel: 'Payments',
                tableName: 'payments',

                fieldType: 'metric',
                basicType: 'number',
                type: 'field',
                tags: [],
            });
        });
    });

    it('Should search with partial word (cust)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=cust`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.gt(0);

            // Check for a returned field
            const matchingField = resp.body.results.find(
                (f) =>
                    f.name === 'customer_id' &&
                    f.tableLabel === 'Users' &&
                    f.type === 'field',
            );
            expect(matchingField).to.eql({
                name: 'customer_id',
                tableLabel: 'Users',
                tableName: 'users',

                description: 'This is a unique identifier for a customer',
                type: 'field',
                basicType: 'number',
                fieldType: 'dimension',
                tags: [],
            });

            // Check for a table
            const matchingTable = resp.body.results.find(
                (t) => t.name === 'customers',
            );
            expect(matchingTable).to.eql({
                name: 'customers',
                description:
                    "# Customers\n\nThis table has basic information about a customer, as well as some derived\nfacts based on a customer's orders\n",
                type: 'table',
                tags: [],
            });
        });
    });

    it('Should search with multiple words (order date)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=order%20date`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length.gt(0);

            const matchingField = resp.body.results.find(
                (f) => f.name === 'date_of_first_order' && f.type === 'field',
            );
            expect(matchingField).to.eql({
                name: 'date_of_first_order',
                tableLabel: 'Orders',
                tableName: 'orders',

                description: 'Min of Order date',
                type: 'field',
                basicType: 'number',
                fieldType: 'metric',
                tags: [],
            });
        });
    });

    it('Should filter fields with required attributes (age)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=age`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(0);
        });
    });

    it('Should filter table with required attributes (memberships)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=memberships`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(0);
        });
    });
    it('Should filter field in table without attribute access (plan)', () => {
        const projectUuid = SEED_PROJECT.project_uuid;
        cy.request(
            `${apiUrl}/projects/${projectUuid}/dataCatalog?search=plan`,
        ).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.have.length(0);
        });
    });
});
