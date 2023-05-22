import { SEED_GROUP, SEED_ORG_1_ADMIN } from '@lightdash/common';

describe('Groups API', () => {
    it('should return a group to admin', () => {
        cy.login();
        cy.request({
            url: `api/v1/groups/${SEED_GROUP.groupUuid}`,
            method: 'GET',
        })
            .its('status')
            .should('eq', 200);
    });

    it('should forbid group outside the organization', () => {
        cy.anotherLogin();
        cy.request({
            url: `api/v1/groups/${SEED_GROUP.groupUuid}`,
            method: 'GET',
            failOnStatusCode: false,
        })
            .its('status')
            .should('eq', 403);
    });

    it('should create a group in organization', () => {
        cy.login();
        cy.request({
            url: 'api/v1/org/groups',
            method: 'POST',
            body: {
                name: 'Org A Group',
            },
        })
            .its('response')
            .should((r) => expect(r.statusCode).to.eq(201))
            .should((r) => expect(r.body.name).to.eq('Org A Group'));
    });

    it('should return a list of groups in organization', () => {
        cy.login();
        cy.request({
            url: 'api/v1/org/groups',
            method: 'GET',
        })
            .its('response')
            .should((r) => expect(r.statusCode).to.eq(200));
    });

    it('should not return groups to another organization', () => {
        cy.anotherLogin();
        cy.request({
            url: 'api/v1/org/groups',
            method: 'GET',
        })
            .its('response')
            .should((r) => expect(r.statusCode).to.eq(200))
            .should((r) => expect(r.body.length).to.eq(0));
    });

    it('should add members to group', () => {
        cy.login();
        cy.request({
            url: `api/v1/groups/${SEED_GROUP.groupUuid}/members/${SEED_ORG_1_ADMIN.user_uuid}`,
            method: 'PUT',
        })
            .its('status')
            .should('eq', 200);
    });

    it('should delete group from organization', () => {
        cy.login();
        cy.request({
            url: 'api/v1/org/groups',
            method: 'POST',
            body: {
                name: 'Test group',
            },
        })
            .its('response')
            .then((response) =>
                cy.request({
                    url: `api/v1/groups/${response.body.results.uuid}`,
                    method: 'DELETE',
                }),
            )
            .its('response')
            .should((r) => expect(r.statusCode).to.eq(200));
    });

    it('should update group name', () => {
        cy.login();
        cy.request({
            url: 'api/v1/org/groups',
            method: 'POST',
            body: {
                name: 'Test group',
            },
        })
            .its('response')
            .then((response) =>
                cy.request({
                    url: `api/v1/groups/${response.body.results.uuid}`,
                    method: 'PATCH',
                    body: {
                        name: 'New name',
                    },
                }),
            )
            .its('response')
            .should((r) => expect(r.statusCode).to.eq(200))
            .should((r) => expect(r.body.results.name).to.eq('New name'));
    });

    it('should get group members', () => {
        cy.login();
        cy.request({
            url: `api/v1/groups/${SEED_GROUP.groupUuid}/members`,
            method: 'GET',
        })
            .its('status')
            .should('eq', 200);
    });
});
