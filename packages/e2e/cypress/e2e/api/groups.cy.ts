import { SEED_GROUP, SEED_ORG_1_ADMIN } from '@lightdash/common';

describe('Groups API', () => {
    beforeEach(() => {
        cy.login();
    });

    it('should return a group to admin', () => {
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
        cy.request({
            url: 'api/v1/org/groups',
            method: 'POST',
            body: {
                name: 'Org A Group',
            },
        }).then((resp) => {
            expect(resp.status).to.eq(201);
            expect(resp.body.results.name).to.eq('Org A Group');
        });
    });

    it('should return a list of groups in organization', () => {
        cy.request({
            url: 'api/v1/org/groups',
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(
                resp.body.results.find((group) => group.name === 'Org A Group'),
            ).to.not.eq(undefined); // Depends on a previous test
        });
    });

    it('should not return groups to another organization', () => {
        cy.anotherLogin();
        cy.request({
            url: 'api/v1/org/groups',
            method: 'GET',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            expect(resp.body.results).to.length(0);
        });
    });

    it('should add members to group', () => {
        cy.request({
            url: `api/v1/groups/${SEED_GROUP.groupUuid}/members/${SEED_ORG_1_ADMIN.user_uuid}`,
            method: 'PUT',
        }).then((resp) => {
            expect(resp.status).to.eq(204);
        });
    });

    it('should delete group from organization', () => {
        cy.request({
            url: 'api/v1/org/groups',
            method: 'POST',
            body: {
                name: 'Test group',
            },
        }).then((response) =>
            cy
                .request({
                    url: `api/v1/groups/${response.body.results.uuid}`,
                    method: 'DELETE',
                })
                .then((resp) => {
                    expect(resp.status).to.eq(200);
                }),
        );
    });

    it('should update group name', () => {
        cy.request({
            url: 'api/v1/org/groups',
            method: 'POST',
            body: {
                name: 'Test group',
            },
        }).then((response) =>
            cy
                .request({
                    url: `api/v1/groups/${response.body.results.uuid}`,
                    method: 'PATCH',
                    body: {
                        name: 'New name',
                    },
                })
                .then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body.results.name).to.eq('New name');
                }),
        );
    });

    it('should get group members', () => {
        cy.request({
            url: `api/v1/groups/${SEED_GROUP.groupUuid}/members`,
            method: 'GET',
        })
            .its('status')
            .should('eq', 200);
    });
});
