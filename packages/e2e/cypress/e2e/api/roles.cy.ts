import { Role, SEED_ORG_1, SEED_ORG_2 } from '@lightdash/common';

describe('Roles API', () => {
    const deleteRole = (roleUuid: string) => {
        cy.request({
            url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${roleUuid}`,
            method: 'DELETE',
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    };

    const createRole = (name: string, description?: string) => {
        const roleName = `${name} ${new Date().getTime()}`;
        return cy
            .request({
                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    ...(description && { description }),
                },
            })
            .then((resp) => {
                expect(resp.status).to.eq(201);
                expect(resp.body).to.have.property('status', 'ok');
                expect(resp.body.results).to.have.property('roleUuid');
                return resp.body.results.roleUuid;
            });
    };

    const getFirstScope = () =>
        cy
            .request({
                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/scopes`,
                method: 'GET',
            })
            .then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body.results).to.be.an('array');
                expect(resp.body.results.length).to.be.greaterThan(0);
                return resp.body.results[0].scopeUuid;
            });

    const addScopeToRole = (roleUuid: string, scopeUuid: string) =>
        cy
            .request({
                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${roleUuid}/scopes`,
                method: 'POST',
                body: {
                    scopeUuids: [scopeUuid],
                },
            })
            .then((resp) => {
                expect(resp.status).to.eq(201);
                expect(resp.body).to.have.property('status', 'ok');
                expect(resp.body.results).to.be.an('array');
                return resp.body.results;
            });

    beforeEach(() => {
        cy.login();
    });

    describe('GET /api/v1/organizations/{orgUuid}/roles/scopes', () => {
        it('should return all available scopes', () => {
            cy.request({
                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/scopes`,
                method: 'GET',
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
                expect(resp.body.results).to.be.an('array');
            });
        });

        it('should forbid scopes access to unauthenticated users', () => {
            cy.logout();

            cy.request({
                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/scopes`,
                method: 'GET',
                headers: {
                    Authorization: 'Bearer invalid-token',
                },
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(401);
            });
        });
    });

    describe('POST /api/v1/organizations/{orgUuid}/roles', () => {
        it('should create a new role', () => {
            const roleName = `Test Role ${new Date().getTime()}`;
            cy.request({
                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Test role description',
                },
            })
                .then((resp) => {
                    expect(resp.status).to.eq(201);
                    expect(resp.body).to.have.property('status', 'ok');
                    expect(resp.body.results).to.have.property(
                        'name',
                        roleName,
                    );
                    expect(resp.body.results).to.have.property(
                        'description',
                        'Test role description',
                    );
                    expect(resp.body.results).to.have.property('roleUuid');
                    expect(resp.body.results).to.have.property(
                        'organizationUuid',
                        SEED_ORG_1.organization_uuid,
                    );

                    return resp.body.results.roleUuid;
                })
                .then(deleteRole);
        });

        it('should not allow duplicate role names in same organization', () => {
            const roleName = `Duplicate Test ${new Date().getTime()}`;

            // Create first role
            let firstRoleUuid: string;
            cy.request({
                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                },
            }).then((createResp) => {
                firstRoleUuid = createResp.body.results.roleUuid;

                // Try to create duplicate
                cy.request({
                    url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles`,
                    method: 'POST',
                    body: {
                        name: roleName,
                    },
                    failOnStatusCode: false,
                })
                    .then((resp) => {
                        expect(resp.status).to.eq(409);
                    })
                    .then(() => {
                        // Clean up the created role
                        deleteRole(firstRoleUuid);
                    });
            });
        });

        it('should forbid role creation from another organization', () => {
            cy.anotherLogin();
            cy.request({
                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles`,
                method: 'POST',
                body: {
                    name: 'Unauthorized Role',
                },
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
            });
        });
    });

    describe('GET /api/v1/organizations/{orgUuid}/roles', () => {
        it('should return organization roles without scopes', () => {
            // Create a role first to test with
            createRole('Test Role for List').then((createdRoleUuid) => {
                cy.request({
                    url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles`,
                    method: 'GET',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body).to.have.property('status', 'ok');
                    expect(resp.body.results).to.be.an('array');

                    // Check that the created role is in the list
                    const foundRole = resp.body.results.find(
                        (role: Role) => role.roleUuid === createdRoleUuid,
                    );
                    expect(foundRole).to.not.equal(undefined);

                    // Roles list should not include scopes
                    resp.body.results.forEach((role: Role) => {
                        expect(role).to.not.have.property('scopes');
                    });

                    // Clean up
                    deleteRole(createdRoleUuid);
                });
            });
        });

        it('should not return roles from another organization', () => {
            // Create a role in org 1
            createRole('Org1 Role').then((org1RoleUuid) => {
                cy.anotherLogin();
                cy.request({
                    url: `api/v1/organizations/${SEED_ORG_2.organization_uuid}/roles`,
                    method: 'GET',
                })
                    .then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body.results).to.be.an('array');

                        // Should not contain the role created in SEED_ORG_1
                        const foundRole = resp.body.results.find(
                            (role: Role) => role.roleUuid === org1RoleUuid,
                        );
                        expect(foundRole).to.equal(undefined);
                    })
                    .then(() => {
                        // Clean up
                        cy.login();
                        deleteRole(org1RoleUuid);
                    });
            });
        });
    });

    describe('GET /api/v1/organizations/{orgUuid}/roles/{roleUuid}', () => {
        it('should return a specific role with its scopes', () => {
            createRole('Test Role for Get').then((createdRoleUuid) => {
                cy.request({
                    url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${createdRoleUuid}`,
                    method: 'GET',
                })
                    .then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body).to.have.property('status', 'ok');
                        expect(resp.body.results).to.have.property(
                            'roleUuid',
                            createdRoleUuid,
                        );
                        expect(resp.body.results).to.have.property('scopes');
                        expect(resp.body.results.scopes).to.be.an('array');
                    })
                    .then(() => {
                        deleteRole(createdRoleUuid);
                    });
            });
        });

        it('should return 404 when getting a non-existent role', () => {
            cy.request({
                url: `api/v1/organizations/${
                    SEED_ORG_1.organization_uuid
                }/roles/${window.crypto.randomUUID()}`,
                method: 'GET',
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(404);
            });
        });

        it('should forbid access to role from another organization', () => {
            // Create a role in org 1
            createRole('Org1 Role for Access Test').then((org1RoleUuid) => {
                cy.anotherLogin();
                cy.request({
                    url: `api/v1/organizations/${SEED_ORG_2.organization_uuid}/roles/${org1RoleUuid}`,
                    method: 'GET',
                    failOnStatusCode: false,
                })
                    .then((resp) => {
                        expect(resp.status).to.eq(404);
                    })
                    .then(() => {
                        // Clean up
                        cy.login();
                        deleteRole(org1RoleUuid);
                    });
            });
        });
    });

    describe('PATCH /api/v1/organizations/{orgUuid}/roles/{roleUuid}', () => {
        it('should update role name and description', () => {
            createRole('Test Role for Update').then((createdRoleUuid) => {
                const updatedName = `Updated Role ${new Date().getTime()}`;
                const updatedDescription = 'Updated description';

                cy.request({
                    url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${createdRoleUuid}`,
                    method: 'PATCH',
                    body: {
                        name: updatedName,
                        description: updatedDescription,
                    },
                })
                    .then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body.results).to.have.property(
                            'name',
                            updatedName,
                        );
                        expect(resp.body.results).to.have.property(
                            'description',
                            updatedDescription,
                        );
                    })
                    .then(() => {
                        deleteRole(createdRoleUuid);
                    });
            });
        });

        it('should update only role description', () => {
            createRole('Test Role for Description Update').then(
                (createdRoleUuid) => {
                    const newDescription = 'Another description update';

                    cy.request({
                        url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${createdRoleUuid}`,
                        method: 'PATCH',
                        body: {
                            description: newDescription,
                        },
                    })
                        .then((resp) => {
                            expect(resp.status).to.eq(200);
                            expect(resp.body.results).to.have.property(
                                'description',
                                newDescription,
                            );
                        })
                        .then(() => {
                            deleteRole(createdRoleUuid);
                        });
                },
            );
        });

        it('should not allow updating to duplicate name', () => {
            const duplicateName = `Duplicate Update ${new Date().getTime()}`;
            let duplicateRoleUuid: string;

            // Create a role with this name
            cy.request({
                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles`,
                method: 'POST',
                body: {
                    name: duplicateName,
                },
            })
                .then((createResp) => {
                    duplicateRoleUuid = createResp.body.results.roleUuid;

                    // Create another role to try to update
                    return createRole('Role to Update');
                })
                .then((roleToUpdateUuid) => {
                    // Try to update another role to this name
                    cy.request({
                        url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${roleToUpdateUuid}`,
                        method: 'PATCH',
                        body: {
                            name: duplicateName,
                        },
                        failOnStatusCode: false,
                    })
                        .then((resp) => {
                            expect(resp.status).to.eq(409);
                        })
                        .then(() => {
                            // Clean up both created roles
                            deleteRole(duplicateRoleUuid);
                            deleteRole(roleToUpdateUuid);
                        });
                });
        });
    });

    describe('POST /api/v1/organizations/{orgUuid}/roles/{roleUuid}/scopes', () => {
        it('should add a scope to a role', () => {
            // Create a role and get a scope
            createRole('Test Role for Scope').then((createdRoleUuid) => {
                getFirstScope().then((scopeUuid) => {
                    addScopeToRole(createdRoleUuid, scopeUuid).then(() => {
                        deleteRole(createdRoleUuid);
                    });
                });
            });
        });

        it('should not allow adding the same scope twice', () => {
            createRole('Test Role for Duplicate Scope').then(
                (createdRoleUuid) => {
                    getFirstScope().then((scopeUuid) => {
                        // Add scope first time
                        addScopeToRole(createdRoleUuid, scopeUuid).then(() => {
                            // Try to add the same scope again
                            cy.request({
                                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${createdRoleUuid}/scopes`,
                                method: 'POST',
                                body: {
                                    scopeUuids: [scopeUuid],
                                },
                                failOnStatusCode: false,
                            })
                                .then((resp) => {
                                    expect(resp.status).to.eq(409);
                                })
                                .then(() => {
                                    deleteRole(createdRoleUuid);
                                });
                        });
                    });
                },
            );
        });

        it('should return 404 when adding non-existent scope', () => {
            createRole('Test Role for Invalid Scope').then(
                (createdRoleUuid) => {
                    cy.request({
                        url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${createdRoleUuid}/scopes`,
                        method: 'POST',
                        body: {
                            scopeUuids: [window.crypto.randomUUID()],
                        },
                        failOnStatusCode: false,
                    })
                        .then((resp) => {
                            expect(resp.status).to.eq(404);
                        })
                        .then(() => {
                            deleteRole(createdRoleUuid);
                        });
                },
            );
        });
    });

    describe('DELETE /api/v1/organizations/{orgUuid}/roles/{roleUuid}/scopes', () => {
        it('should remove a scope from a role', () => {
            createRole('Test Role for Scope Removal').then(
                (createdRoleUuid) => {
                    getFirstScope().then((scopeUuid) => {
                        // Add scope first
                        addScopeToRole(createdRoleUuid, scopeUuid).then(() => {
                            // Remove the scope using the bulk route
                            cy.request({
                                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${createdRoleUuid}/scopes`,
                                method: 'DELETE',
                                body: {
                                    scopeUuids: [scopeUuid],
                                },
                            })
                                .then((resp) => {
                                    expect(resp.status).to.eq(200);
                                    expect(resp.body).to.have.property(
                                        'status',
                                        'ok',
                                    );
                                })
                                .then(() => {
                                    deleteRole(createdRoleUuid);
                                });
                        });
                    });
                },
            );
        });

        it('should return 404 when trying to remove non-existent scope assignment', () => {
            createRole('Test Role for Invalid Scope Removal').then(
                (createdRoleUuid) => {
                    getFirstScope().then((scopeUuid) => {
                        cy.request({
                            url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${createdRoleUuid}/scopes`,
                            method: 'DELETE',
                            body: {
                                scopeUuids: [scopeUuid],
                            },
                            failOnStatusCode: false,
                        })
                            .then((resp) => {
                                expect(resp.status).to.eq(404);
                            })
                            .then(() => {
                                deleteRole(createdRoleUuid);
                            });
                    });
                },
            );
        });
    });

    describe('DELETE /api/v1/organizations/{orgUuid}/roles/{roleUuid}', () => {
        it('should delete a role with all its scope associations', () => {
            // Create a role to delete
            createRole('Role to Delete').then((roleToDeleteUuid) => {
                getFirstScope().then((scopeUuid) => {
                    // Add a scope to the role
                    addScopeToRole(roleToDeleteUuid, scopeUuid).then(() => {
                        // Delete the role
                        cy.request({
                            url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${roleToDeleteUuid}`,
                            method: 'DELETE',
                        }).then((resp) => {
                            expect(resp.status).to.eq(200);

                            // Verify the role is deleted
                            cy.request({
                                url: `api/v1/organizations/${SEED_ORG_1.organization_uuid}/roles/${roleToDeleteUuid}`,
                                method: 'GET',
                                failOnStatusCode: false,
                            }).then((getResp) => {
                                expect(getResp.status).to.eq(404);
                            });
                        });
                    });
                });
            });
        });

        it('should return 404 for deleting a non-existent role', () => {
            cy.request({
                url: `api/v1/organizations/${
                    SEED_ORG_1.organization_uuid
                }/roles/${window.crypto.randomUUID()}`,
                method: 'DELETE',
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(404);
            });
        });

        it('should forbid deleting role from another organization', () => {
            // Create a role in org 1
            createRole('Org1 Role for Delete Test').then((org1RoleUuid) => {
                // Try to delete from org 2
                cy.anotherLogin();
                cy.request({
                    url: `api/v1/organizations/${SEED_ORG_2.organization_uuid}/roles/${org1RoleUuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                })
                    .then((resp) => {
                        expect(resp.status).to.eq(404);
                    })
                    .then(() => {
                        // Clean up the created role
                        cy.login();
                        deleteRole(org1RoleUuid);
                    });
            });
        });
    });
});
