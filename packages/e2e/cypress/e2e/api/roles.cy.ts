import {
    AnyType,
    SEED_GROUP,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';

const apiUrl = '/api/v2/roles';

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
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                    url: `${apiUrl}/org/${testOrgUuid}`,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                        url: `${apiUrl}/org/${testOrgUuid}?load=scopes`,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                    url: `${apiUrl}/${roleUuid}`,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role to be deleted',
                },
            }).then((createResp) => {
                const { roleUuid } = createResp.body.results;

                // Delete the role
                cy.request({
                    url: `${apiUrl}/${roleUuid}`,
                    method: 'DELETE',
                }).then((deleteResp) => {
                    expect(deleteResp.status).to.eq(200);
                    expect(deleteResp.body).to.have.property('status', 'ok');
                });
            });
        });
    });

    describe('Role Assignments', () => {
        const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

        it('should assign role to user in organization', () => {
            // First create a test role
            const roleName = `Assignment Role ${new Date().getTime()}`;

            cy.request({
                url: `${apiUrl}/org/${testOrgUuid}`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role for assignment testing',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = createResp.body.results;

                // Assign role to user
                cy.request({
                    url: `${apiUrl}/org/${testOrgUuid}/users/${testUserUuid}/role/${roleUuid}`,
                    method: 'PATCH',
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(200);
                    expect(assignResp.body).to.have.property('status', 'ok');
                });
            });
        });

        it('should assign role to group', () => {
            // First create a test role
            const roleName = `Group Assignment Role ${new Date().getTime()}`;

            cy.request({
                url: `${apiUrl}/org/${testOrgUuid}`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role for group assignment testing',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = createResp.body.results;

                // Assign role to group
                cy.request({
                    url: `${apiUrl}/groups/${SEED_GROUP.groupUuid}/role/${roleUuid}`,
                    method: 'PATCH',
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(200);
                    expect(assignResp.body).to.have.property('status', 'ok');
                });
            });
        });
    });

    describe('Project Access Management', () => {
        it('should get project access information', () => {
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/access`,
                method: 'GET',
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
                expect(resp.body.results).to.have.property('users');
                expect(resp.body.results).to.have.property('groups');
                expect(resp.body.results.users).to.be.an('array');
                expect(resp.body.results.groups).to.be.an('array');
            });
        });

        it('should create user project access', () => {
            const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

            // Create a test role
            cy.request({
                url: `${apiUrl}/org/${testOrgUuid}`,
                method: 'POST',
                body: {
                    name: `Project Access Role ${new Date().getTime()}`,
                    description: 'Role for project access testing',
                },
            }).then((roleResp) => {
                cy.wrap(roleResp.body.results.roleUuid).as('testRoleUuid');

                // Create project access
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/access`,
                    method: 'POST',
                    body: {
                        userUuid: testUserUuid,
                        roleUuid: roleResp.body.results.roleUuid,
                    },
                    failOnStatusCode: false, // May fail if user already has access
                }).then((accessResp) => {
                    // May return 409 if user already has access, which is acceptable
                    expect([200, 201, 409]).to.include(accessResp.status);
                });
            });
        });

        it('should assign group to project', () => {
            // Create a test role
            cy.request({
                url: `${apiUrl}/org/${testOrgUuid}`,
                method: 'POST',
                body: {
                    name: `Group Project Role ${new Date().getTime()}`,
                    description: 'Role for group project assignment',
                },
            }).then((roleResp) => {
                cy.wrap(roleResp.body.results.roleUuid).as('testRoleUuid');

                // Assign group to project
                cy.request({
                    url: `${apiUrl}/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                    method: 'PATCH',
                    body: {
                        roleUuid: roleResp.body.results.roleUuid,
                    },
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(200);
                    expect(assignResp.body).to.have.property('status', 'ok');
                });

                // Remove group from project
                cy.request({
                    url: `${apiUrl}/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                    method: 'DELETE',
                }).then((removeResp) => {
                    expect(removeResp.status).to.eq(200);
                    expect(removeResp.body).to.have.property('status', 'ok');
                });
            });
        });
    });

    describe('Role Scopes Management', () => {
        it('should add scopes to role', () => {
            // First create a test role
            const roleName = `Scoped Role ${new Date().getTime()}`;

            cy.request({
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
                method: 'GET',
            }).then((resp) => {
                const systemRole = resp.body.results.find(
                    (role: AnyType) =>
                        role.name === 'admin' || role.name === 'member',
                );

                if (systemRole) {
                    // Try to delete system role
                    cy.request({
                        url: `${apiUrl}/${systemRole.roleUuid}`,
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
                    url: `${apiUrl}/org/${testOrgUuid}`,
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
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/access`,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/access`,
                        method: 'POST',
                        body: {
                            userUuid: SEED_ORG_1_ADMIN.user_uuid,
                            roleUuid,
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
                url: `${apiUrl}/org/${testOrgUuid}`,
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
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/user/${SEED_ORG_1_ADMIN.user_uuid}`,
                        method: 'PATCH',
                        body: {
                            roleUuid,
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
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/user/${SEED_ORG_1_ADMIN.user_uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            });
        });

        it('should forbid viewer from assigning group to project', () => {
            // First create a role as admin
            cy.login();
            cy.request({
                url: `${apiUrl}/org/${testOrgUuid}`,
                method: 'POST',
                body: {
                    name: `Group Test Role ${new Date().getTime()}`,
                    description: 'Test role for group permission testing',
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
                        url: `${apiUrl}/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                        method: 'PATCH',
                        body: {
                            roleUuid,
                        },
                        failOnStatusCode: false,
                    }).then((resp) => {
                        expect(resp.status).to.eq(403);
                    });
                });
            });
        });

        it('should forbid viewer from removing group from project', () => {
            cy.loginWithPermissions('member', [
                {
                    role: 'viewer',
                    projectUuid: SEED_PROJECT.project_uuid,
                },
            ]).then(() => {
                // Try to remove group from project as viewer
                cy.request({
                    url: `${apiUrl}/groups/${SEED_GROUP.groupUuid}/projects/${SEED_PROJECT.project_uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect(resp.status).to.eq(403);
                });
            });
        });

        it('should allow admin to manage project access', () => {
            cy.login(); // Switch back to admin

            // Admin should be able to get project access
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/access`,
                method: 'GET',
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
                expect(resp.body.results).to.have.property('users');
                expect(resp.body.results).to.have.property('groups');
            });
        });
    });
});
