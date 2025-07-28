import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Field value search', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Should test filtering values on orders', () => {
        cy.request({
            method: 'POST',
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`,
            body: {
                forceRefresh: false,
                search: '',
                limit: 100,
                table: 'orders',
            },
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('results');
            const expectedStatuses = ['completed', 'shipped'];
            const actualStatuses = response.body.results.results;
            expectedStatuses.forEach((status) => {
                expect(actualStatuses).to.include(status);
            });
        });
    });

    it('Should test filtering "completed" value', () => {
        cy.request({
            method: 'POST',
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`,
            body: {
                search: 'completed',
                limit: 100,
                table: 'orders',
            },
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('results');
            expect(response.body.results.results).to.have.lengthOf(1);
            const actualStatuses = response.body.results.results;
            expect(actualStatuses).to.include('completed');
            expect(actualStatuses).to.not.include('shipped');
        });
    });

    it('Should return empty results for non existing field search', () => {
        cy.request({
            method: 'POST',
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`,
            body: {
                search: 'invalid',
                limit: 100,
                table: 'orders',
            },
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('results');
            expect(response.body.results.results).to.have.lengthOf(0);
        });
    });

    it('Should return empty results for invalid numeric search', () => {
        cy.request({
            method: 'POST',
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_order_id/search`,
            body: {
                search: '99',
                limit: 100,
                table: 'orders',
            },
            failOnStatusCode: false,
        }).then((response) => {
            // This number field filter is not supported
            expect(response.status).to.eq(400);
        });
    });

    it('Should return empty results for invalid string search', () => {
        cy.request({
            method: 'POST',
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/field/orders_status/search`,
            body: {
                search: "\\') OR TRUE --",
                limit: 100,
                table: 'orders',
            },
        }).then((response) => {
            expect(response.status).to.eq(200);
            expect(response.body).to.have.property('results');
            expect(response.body.results.results).to.have.lengthOf(0);
        });
    });
});
