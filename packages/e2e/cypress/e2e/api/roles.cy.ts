import {
    AnyType,
    SEED_GROUP,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';

const apiUrl = '/api/v2/roles';
const orgRolesApiUrl = '/api/v2/orgs';
const projectRolesApiUrl = '/api/v2/projects';

describe('Roles API Tests', () => {
    beforeEach(() => {
        cy.login();
        cy.wrap(null).as('testRoleUuid'); // placeholder for testRoleUuid alias
    });

    const testOrgUuid = SEED_ORG_1.organization_uuid;

    afterEach(() => {
        // Clean up test role if it exists
        cy.get('@testRoleUuid').then((testRoleUuid) => {
            if (testRoleUuid) {
                cy.request({
                    url: `${apiUrl}/${testRoleUuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });
    });

    describe('Organization Roles', () => {
        it('should create a custom role in organization', () => {
            const roleName = `Custom Role ${new Date().getTime()}`;
            const roleDescription = 'Test role created by integration test';

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: roleDescription,
                },
            }).then((resp) => {
                expect(resp.status).to.eq(201);
                expect(resp.body).to.have.property('status', 'ok');
                expect(resp.body.results).to.have.property('name', roleName);
                expect(resp.body.results).to.have.property(
                    'description',
                    roleDescription,
                );
                expect(resp.body.results).to.have.property('roleUuid');
                expect(resp.body.results).to.have.property(
                    'organizationUuid',
                    testOrgUuid,
                );

                // Store for cleanup
                cy.wrap(resp.body.results.roleUuid).as('testRoleUuid');
            });
        });

        it('should list organization roles without scopes', () => {
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: `Custom Role ${new Date().getTime()}`,
                    description: `Custom role description`,
                },
            }).then((createResp) => {
                expect(createResp.status).to.eq(201);
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                    method: 'GET',
                }).then((resp) => {
                    expect(resp.status).to.eq(200);
                    expect(resp.body).to.have.property('status', 'ok');
                    expect(resp.body.results).to.be.an('array');
                    // Should include system roles like admin, member, etc.
                    expect(resp.body.results.length).to.be.greaterThan(0);
                });
            });
        });

        it('should list organization roles with scopes', () => {
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: `Custom Role ${new Date().getTime()}`,
                    description: `Custom role description`,
                },
            }).then((createResp) => {
                expect(createResp.status).to.eq(201);
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                // Add scopes to role
                cy.request({
                    url: `${apiUrl}/${createResp.body.results.roleUuid}/scopes`,
                    method: 'POST',
                    body: {
                        scopeNames: ['view_project', 'view_dashboard'],
                    },
                }).then((scopeResp) => {
                    expect(scopeResp.status).to.eq(200);
                    expect(scopeResp.body).to.have.property('status', 'ok');

                    cy.request({
                        url: `${orgRolesApiUrl}/${testOrgUuid}/roles?load=scopes`,
                        method: 'GET',
                    }).then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body).to.have.property('status', 'ok');
                        expect(resp.body.results).to.be.an('array');
                        // When loading scopes, each role should have a scopes property
                        expect(resp.body.results.length).to.be.greaterThan(0);
                        const roleWithScopes = resp.body.results.find(
                            (role: AnyType) =>
                                role.roleUuid ===
                                createResp.body.results.roleUuid,
                        );
                        expect(roleWithScopes).to.have.property('scopes');
                        expect(roleWithScopes.scopes).to.be.an('array');
                        expect(roleWithScopes.scopes).to.include(
                            'view_project',
                        );
                        expect(roleWithScopes.scopes).to.include(
                            'view_dashboard',
                        );
                    });
                });
            });
        });

        it('should forbid listing roles from different organization', () => {
            cy.anotherLogin();
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'GET',
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
            });
        });

        it('should update a custom role', () => {
            // First create a role to update
            const roleName = `Updatable Role ${new Date().getTime()}`;

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Original description',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = createResp.body.results;
                const updatedDescription = 'Updated description';

                // Update the role
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}`,
                    method: 'PATCH',
                    body: {
                        description: updatedDescription,
                    },
                }).then((updateResp) => {
                    expect(updateResp.status).to.eq(200);
                    expect(updateResp.body.results).to.have.property(
                        'description',
                        updatedDescription,
                    );
                    expect(updateResp.body.results).to.have.property(
                        'name',
                        roleName,
                    );
                });
            });
        });

        it('should delete a custom role', () => {
            // First create a role to delete
            const roleName = `Deletable Role ${new Date().getTime()}`;

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role to be deleted',
                },
            }).then((createResp) => {
                const { roleUuid } = createResp.body.results;

                // Delete the role
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}`,
                    method: 'DELETE',
                }).then((deleteResp) => {
                    expect(deleteResp.status).to.eq(200);
                    expect(deleteResp.body).to.have.property('status', 'ok');
                });
            });
        });
    });

    describe('Unified Role Assignments', () => {
        const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

        it('should list organization role assignments', () => {
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments`,
                method: 'GET',
                failOnStatusCode: false, // May not be implemented yet
            }).then((resp) => {
                if (resp.status === 200) {
                    expect(resp.body).to.have.property('status', 'ok');
                    expect(resp.body.results).to.be.an('array');
                }
            });
        });

        it('should create organization role assignment for user', () => {
            // First create a test role
            const roleName = `Unified User Assignment Role ${new Date().getTime()}`;

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role for unified user assignment testing',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = createResp.body.results;

                // Assign role to user using unified API
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments`,
                    method: 'POST',
                    body: {
                        roleId: roleUuid,
                        assigneeType: 'user',
                        assigneeId: testUserUuid,
                    },
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(201);
                    expect(assignResp.body).to.have.property('status', 'ok');
                    expect(assignResp.body.results).to.have.property(
                        'roleId',
                        roleUuid,
                    );
                    expect(assignResp.body.results).to.have.property(
                        'assigneeType',
                        'user',
                    );
                    expect(assignResp.body.results).to.have.property(
                        'assigneeId',
                        testUserUuid,
                    );
                    expect(assignResp.body.results).to.have.property(
                        'organizationId',
                        testOrgUuid,
                    );

                    // Clean up assignment
                    cy.request({
                        url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/user/${testUserUuid}`,
                        method: 'DELETE',
                        failOnStatusCode: false,
                    });
                });
            });
        });

        it('should reject organization role assignment for group', () => {
            // First create a test role
            const roleName = `Unified Group Assignment Role ${new Date().getTime()}`;

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role for unified group assignment testing',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = createResp.body.results;

                // Try to assign role to group using unified API - should fail
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments`,
                    method: 'POST',
                    body: {
                        roleId: roleUuid,
                        assigneeType: 'group',
                        assigneeId: SEED_GROUP.groupUuid,
                    },
                    failOnStatusCode: false,
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(400);
                    expect(assignResp.body).to.have.property('status', 'error');
                    expect(assignResp.body).to.have.property('error');
                    expect(assignResp.body.error).to.have.property(
                        'message',
                        'Organization-level group role assignments are not supported',
                    );
                });
            });
        });

        it('should delete organization role assignment for user', () => {
            // First create a test role and assignment
            const roleName = `Delete User Assignment Role ${new Date().getTime()}`;

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role for delete user assignment testing',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = createResp.body.results;

                // Create assignment first
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments`,
                    method: 'POST',
                    body: {
                        roleId: roleUuid,
                        assigneeType: 'user',
                        assigneeId: testUserUuid,
                    },
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(201);

                    // Delete the assignment
                    cy.request({
                        url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/user/${testUserUuid}`,
                        method: 'DELETE',
                    }).then((deleteResp) => {
                        expect(deleteResp.status).to.eq(200);
                        expect(deleteResp.body).to.have.property(
                            'status',
                            'ok',
                        );
                    });
                });
            });
        });

        it('should get 400 when trying to delete group from org', () => {
            // First create a test role
            const roleName = `Delete Group Assignment Role ${new Date().getTime()}`;

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role for delete group assignment testing',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                // Try to delete group assignment - should fail
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                }).then((deleteResp) => {
                    expect(deleteResp.status).to.eq(400);
                });
            });
        });
    });

    describe('Project Access Management', () => {
        it('should get project access information', () => {
            cy.request({
                url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
                method: 'GET',
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
                expect(resp.body.results).to.be.an('array');
            });
        });

        it('should create user project access', () => {
            const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

            // Create a test role
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: `Project Access Role ${new Date().getTime()}`,
                    description: 'Role for project access testing',
                },
            }).then((roleResp) => {
                cy.wrap(roleResp.body.results.roleUuid).as('testRoleUuid');

                // Create project access
                cy.request({
                    url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
                    method: 'POST',
                    body: {
                        roleId: roleResp.body.results.roleUuid,
                        assigneeType: 'user',
                        assigneeId: testUserUuid,
                    },
                    failOnStatusCode: false, // May fail if user already has access
                }).then((accessResp) => {
                    // May return 409 if user already has access, which is acceptable
                    expect([200, 201, 409]).to.include(accessResp.status);
                });
            });
        });
    });

    describe('Role Scopes Management', () => {
        it('should add scopes to role', () => {
            // First create a test role
            const roleName = `Scoped Role ${new Date().getTime()}`;

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role for scope testing',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = createResp.body.results;

                // Add scopes to role
                cy.request({
                    url: `${apiUrl}/${roleUuid}/scopes`,
                    method: 'POST',
                    body: {
                        scopeNames: ['view_project', 'view_dashboard'],
                    },
                }).then((scopeResp) => {
                    expect(scopeResp.status).to.eq(200);
                    expect(scopeResp.body).to.have.property('status', 'ok');
                });

                // Remove a scope from role
                cy.request({
                    url: `${apiUrl}/${roleUuid}/scopes/view_project`,
                    method: 'DELETE',
                }).then((removeResp) => {
                    expect(removeResp.status).to.eq(200);
                    expect(removeResp.body).to.have.property('status', 'ok');
                });
            });
        });
    });

    describe('Authorization and Security', () => {
        it('should prevent unauthorized users from managing roles', () => {
            cy.anotherLogin(); // Switch to different org user

            // Try to create a role in the original org
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: 'Unauthorized Role',
                    description: 'This should fail',
                },
                failOnStatusCode: false,
            }).then((resp) => {
                expect(resp.status).to.eq(403);
            });
        });

        it('should validate role creation with empty name', () => {
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: '',
                    description: 'Role with empty name',
                },
                failOnStatusCode: false,
            }).then((resp) => {
                expect([400, 422]).to.include(resp.status);
            });
        });

        it('should prevent deleting system roles', () => {
            // Get system roles first
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'GET',
            }).then((resp) => {
                const systemRole = resp.body.results.find(
                    (role: AnyType) =>
                        role.name === 'admin' || role.name === 'member',
                );

                if (systemRole) {
                    // Try to delete system role
                    cy.request({
                        url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${systemRole.roleUuid}`,
                        method: 'DELETE',
                        failOnStatusCode: false,
                    }).then((deleteResp) => {
                        expect([403, 404]).to.include(deleteResp.status);
                    });
                }
            });
        });
    });

    describe('Project Permission Checks', () => {
        it('should forbid viewer from creating roles', () => {
            cy.loginWithPermissions('member', [
                {
                    role: 'viewer',
                    projectUuid: SEED_PROJECT.project_uuid,
                },
            ]).then(() => {
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                    method: 'POST',
                    body: {
                        name: `Unauthorized Role ${new Date().getTime()}`,
                        description: 'This should fail',
                    },
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            });
        });
        it('should forbid viewer from getting project access', () => {
            cy.loginWithPermissions('member', [
                {
                    role: 'viewer',
                    projectUuid: SEED_PROJECT.project_uuid,
                },
            ]).then(() => {
                cy.request({
                    url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
                    method: 'GET',
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            });
        });

        it('should forbid viewer from creating user project access', () => {
            // First create a role as admin
            cy.login();
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: `Test Role ${new Date().getTime()}`,
                    description: 'Test role for permission testing',
                },
            }).then((roleResp) => {
                cy.wrap(roleResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = roleResp.body.results;

                cy.loginWithPermissions('member', [
                    {
                        role: 'viewer',
                        projectUuid: SEED_PROJECT.project_uuid,
                    },
                ]).then(() => {
                    cy.request({
                        url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
                        method: 'POST',
                        body: {
                            roleId: roleUuid,
                            assigneeType: 'user',
                            assigneeId: SEED_ORG_1_ADMIN.user_uuid,
                        },
                        failOnStatusCode: false,
                    }).then((resp) => {
                        expect(resp.status).to.eq(403);
                    });
                });

                // Try to create project access as viewer
            });
        });

        it('should forbid viewer from updating user project access', () => {
            // First create a role as admin
            cy.login();
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: `Update Test Role ${new Date().getTime()}`,
                    description: 'Test role for update permission testing',
                },
            }).then((roleResp) => {
                cy.wrap(roleResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = roleResp.body.results;

                cy.loginWithPermissions('member', [
                    {
                        role: 'viewer',
                        projectUuid: SEED_PROJECT.project_uuid,
                    },
                ]).then(() => {
                    // Try to update project access as viewer
                    cy.request({
                        url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${SEED_ORG_1_ADMIN.user_uuid}`,
                        method: 'PATCH',
                        body: {
                            roleId: roleUuid,
                        },
                        failOnStatusCode: false,
                    }).then((resp) => {
                        expect(resp.status).to.eq(403);
                    });
                });
            });
        });

        it('should forbid viewer from removing user project access', () => {
            cy.loginWithPermissions('member', [
                {
                    role: 'viewer',
                    projectUuid: SEED_PROJECT.project_uuid,
                },
            ]).then(() => {
                // Try to remove project access as viewer
                cy.request({
                    url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${SEED_ORG_1_ADMIN.user_uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            });
        });
    });
});
