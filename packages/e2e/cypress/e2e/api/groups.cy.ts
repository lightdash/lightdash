import { SEED_GROUP, SEED_ORG_1_ADMIN } from '@lightdash/common';

describe('Groups API', () => {
    it('should return a group to admin', () => {
        cy.login();
        cy.request({
            url: `api/v1/groups/${SEED_GROUP.uuid}`,
            method: 'GET',
        })
            .its('status')
            .should('eq', 200);
    });

    it('should forbid group outside the organization', () => {
        cy.anotherLogin();
        cy.request({
            url: `api/v1/groups/${SEED_GROUP.uuid}`,
            method: 'GET',
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
            url: `api/v1/groups/${SEED_GROUP.uuid}/members/${SEED_ORG_1_ADMIN.user_uuid}`,
            method: 'PUT',
        })
            .its('status')
            .should('eq', 200);
    });
});
