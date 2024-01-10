import {
    SEED_GROUP,
    SEED_ORG_1_ADMIN,
    SEED_ORG_2_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';

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

    it('should successfully update group name and members', () => {
        cy.request({
            url: 'api/v1/org/groups',
            method: 'POST',
            body: {
                name: 'Test group',
            },
        }).then((response) => {
            const newGroupName = 'New Group Name';
            const newMembers = [{ userUuid: SEED_ORG_1_ADMIN.user_uuid }];
            cy.request({
                url: `api/v1/groups/${response.body.results.uuid}`,
                method: 'PATCH',
                body: {
                    name: newGroupName,
                    members: newMembers,
                },
            })
                .then((response2) => {
                    expect(response2.status).to.eq(200);
                    expect(response2.body.results.name).to.eq(newGroupName);
                    expect(response2.body.results.members.length).eq(1);
                    expect(response2.body.results.members[0].userUuid).eq(
                        SEED_ORG_1_ADMIN.user_uuid,
                    );
                })
                .then(() => {
                    cy.log('Clear members without changing the name');
                    const emptyMembership = [];
                    cy.request({
                        url: `api/v1/groups/${response.body.results.uuid}`,
                        method: 'PATCH',
                        body: {
                            members: emptyMembership,
                        },
                    }).then((response3) => {
                        expect(response3.status).to.eq(200);
                        expect(response3.body.results.name).to.eq(newGroupName);
                        expect(response3.body.results.members.length).eq(0);
                    });
                });
        });
    });

    it('should not add a user from another or to a group', () => {
        cy.request({
            url: 'api/v1/org/groups',
            method: 'POST',
            body: {
                name: 'Test group 2',
            },
        }).then((response) => {
            const newGroupName = 'New Group Name 2';
            const newMembers = [{ userUuid: SEED_ORG_2_ADMIN.user_uuid }];
            cy.request({
                url: `api/v1/groups/${response.body.results.uuid}`,
                method: 'PATCH',
                body: {
                    name: newGroupName,
                    members: newMembers,
                },
                failOnStatusCode: false,
            }).then((response2) => {
                expect(response2.status).to.eq(500);
            });
        });
    });

    describe('Group Project access API', () => {
        it('should add a group access to a project', () => {
            cy.request({
                url: `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                method: 'POST',
                body: {
                    role: 'viewer',
                },
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body.results).to.deep.eq({
                    groupUuid: SEED_GROUP.groupUuid,
                    projectUuid: SEED_PROJECT.project_uuid,
                    role: 'viewer',
                });
            });
        });

        it('should not add a group access to a project for another organization', () => {
            cy.anotherLogin();
            cy.request({
                url: `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                method: 'POST',
                body: {
                    role: 'viewer',
                },
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
            });
        });

        it('should update a group access to a project', () => {
            cy.request({
                url: `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                method: 'PATCH',
                body: {
                    role: 'editor',
                },
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body.results).to.deep.eq({
                    groupUuid: SEED_GROUP.groupUuid,
                    projectUuid: SEED_PROJECT.project_uuid,
                    role: 'editor',
                });
            });
        });

        it('should not update a group access to a project for another organization', () => {
            cy.anotherLogin();
            cy.request({
                url: `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                method: 'PATCH',
                body: {
                    role: 'editor',
                },
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
            });
        });

        it('should remove a group access from a project', () => {
            cy.request({
                url: `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                method: 'DELETE',
            }).then((resp) => {
                expect(resp.status).to.eq(200);
            });
        });

        it('should not remove a group access from a project for another organization', () => {
            cy.anotherLogin();
            cy.request({
                url: `api/v1/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                method: 'DELETE',
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
            });
        });
    });
});
