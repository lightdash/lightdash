import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Service Accounts API', () => {
    beforeEach(() => {
        cy.login();
    });

    it('Should create a service account', () => {
        const serviceAccount = {
            description: 'e2e test service account',
            expiresAt: '2025-09-11T14:00:00.000Z',
            scopes: ['org:admin'],
        };

        cy.request({
            url: `${apiUrl}/service-accounts`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: serviceAccount,
        }).then((resp) => {
            expect(resp.status).to.eq(201);
            expect(resp.body.results).to.have.property('token');
            expect(resp.body.results).to.have.property(
                'description',
                serviceAccount.description,
            );
            expect(resp.body.results).to.have.property(
                'expiresAt',
                serviceAccount.expiresAt,
            );
            expect(resp.body.results.scopes).to.deep.equal(
                serviceAccount.scopes,
            );
        });
    });

    it('Should list service accounts', () => {
        cy.request({
            url: `${apiUrl}/service-accounts`,
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.be.an('array');
            // Service accounts should have required properties
            if (resp.body.results.length > 0) {
                const firstAccount = resp.body.results[0];
                expect(firstAccount).to.have.property('uuid');
                expect(firstAccount).to.have.property('description');
                expect(firstAccount).to.have.property('createdAt');
                expect(firstAccount).to.have.property('expiresAt');
                expect(firstAccount).to.have.property('scopes');
            }
        });
    });

    it('Should access authorized endpoints with service account token', () => {
        // First create a service account
        const serviceAccount = {
            description: 'e2e test service account for auth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:admin'],
        };

        cy.request({
            url: `${apiUrl}/service-accounts`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: serviceAccount,
        }).then(
            ({
                body: {
                    results: { token },
                },
            }) => {
                // Test accessing projects endpoint with the service account token
                cy.logout();
                cy.request({
                    url: `${apiUrl}/org/projects`,
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                });
            },
        );
    });

    it('Should access /groupAccesses with "org:admin" service account token', () => {
        // First create a service account
        const serviceAccount = {
            description: 'e2e test service account for auth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:admin'],
        };

        cy.request({
            url: `${apiUrl}/service-accounts`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: serviceAccount,
        }).then(
            ({
                body: {
                    results: { token },
                },
            }) => {
                // Test accessing projects endpoint with the service account token
                cy.logout();
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/groupAccesses`,
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                });
            },
        );
    });

    it('Should not access /groupAccesses with "org:read" service account token', () => {
        // First create a service account
        const serviceAccount = {
            description: 'e2e test service account for auth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:read'],
        };

        cy.request({
            url: `${apiUrl}/service-accounts`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: serviceAccount,
        }).then(
            ({
                body: {
                    results: { token },
                },
            }) => {
                // Test accessing projects endpoint with the service account token
                cy.logout();
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/groupAccesses`,
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            },
        );
    });

    it('Should not access unauthorized endpoints with service account token', () => {
        // First create a service account
        const serviceAccount = {
            description: 'e2e test service account for unauth',
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            scopes: ['org:admin'],
        };

        cy.request({
            url: `${apiUrl}/service-accounts`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: serviceAccount,
        }).then(
            ({
                body: {
                    results: { token },
                },
            }) => {
                // Test accessing users endpoint with the service account token
                cy.logout();
                cy.request({
                    url: `${apiUrl}/org/allowedEmailDomains`,
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(401);
                });
            },
        );
    });
});
