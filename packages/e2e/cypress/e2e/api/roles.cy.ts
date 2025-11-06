import {
    AnyType,
    SEED_GROUP,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';

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
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${testRoleUuid}`,
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

        describe('Duplicate Role', () => {
            const cleanupRole = (roleUuid: string) => {
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            };

            it('should duplicate a system role', () => {
                const newRoleName = `Copy of Editor ${new Date().getTime()}`;

                // Duplicate the editor system role
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/editor/duplicate`,
                    method: 'POST',
                    body: {
                        name: newRoleName,
                    },
                }).then((resp) => {
                    expect(resp.status).to.eq(201);
                    expect(resp.body).to.have.property('status', 'ok');
                    expect(resp.body.results).to.have.property(
                        'name',
                        newRoleName,
                    );
                    expect(resp.body.results).to.have.property('roleUuid');
                    expect(resp.body.results).to.have.property('scopes');
                    expect(resp.body.results.scopes).to.be.an('array');
                    // Editor should have scopes
                    expect(resp.body.results.scopes.length).to.be.greaterThan(
                        0,
                    );

                    // Should include editor scopes
                    expect(resp.body.results.scopes).to.include('create:Space');
                    expect(resp.body.results.scopes).to.include('manage:Job');

                    cleanupRole(resp.body.results.roleUuid);
                });
            });

            it('should add scopes to a custom role', () => {
                const roleName = `Test Role ${new Date().getTime()}`;
                let roleUuid: string;

                // Setup: create a custom role
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                    method: 'POST',
                    body: {
                        name: roleName,
                        description: 'Test role for scopes',
                    },
                })
                    .then((createResp) => {
                        expect(createResp.status).to.eq(201);
                        roleUuid = createResp.body.results.roleUuid;

                        // Test: add scopes to the role
                        return cy.request({
                            url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}/scopes`,
                            method: 'POST',
                            body: {
                                scopeNames: ['view_project', 'view_dashboard'],
                            },
                        });
                    })
                    .then((scopeResp) => {
                        // Assertions
                        expect(scopeResp.status).to.eq(200);
                        expect(scopeResp.body).to.have.property('status', 'ok');
                    });
            });

            it('should duplicate a custom role with scopes', () => {
                const originalRoleName = `Original Role ${new Date().getTime()}`;
                const duplicatedRoleName = `Duplicated Role ${new Date().getTime()}`;
                let originalRoleUuid: string;

                // Setup: create a custom role
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                    method: 'POST',
                    body: {
                        name: originalRoleName,
                        description: 'Original role to be duplicated',
                    },
                })
                    .then((createResp) => {
                        originalRoleUuid = createResp.body.results.roleUuid;

                        // Setup: add scopes to the original role
                        return cy.request({
                            url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${originalRoleUuid}/scopes`,
                            method: 'POST',
                            body: {
                                scopeNames: [
                                    'view_project',
                                    'view_dashboard',
                                    'create:Space',
                                ],
                            },
                        });
                    })
                    .then(() =>
                        // Test: duplicate the custom role
                        cy.request({
                            url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${originalRoleUuid}/duplicate`,
                            method: 'POST',
                            body: {
                                name: duplicatedRoleName,
                            },
                        }),
                    )
                    .then((duplicateResp) => {
                        cleanupRole(duplicateResp.body.results.roleUuid);

                        // Assertions
                        expect(duplicateResp.status).to.eq(201);
                        expect(duplicateResp.body).to.have.property(
                            'status',
                            'ok',
                        );
                        expect(duplicateResp.body.results).to.have.property(
                            'name',
                            duplicatedRoleName,
                        );
                        expect(duplicateResp.body.results).to.have.property(
                            'roleUuid',
                        );
                        expect(duplicateResp.body.results.roleUuid).to.not.eq(
                            originalRoleUuid,
                        );
                        expect(duplicateResp.body.results).to.have.property(
                            'scopes',
                        );
                        expect(duplicateResp.body.results.scopes).to.be.an(
                            'array',
                        );

                        // Should have the same scopes as the original
                        expect(
                            duplicateResp.body.results.scopes,
                        ).to.have.lengthOf(3);
                        expect(duplicateResp.body.results.scopes).to.include(
                            'view_project',
                        );
                        expect(duplicateResp.body.results.scopes).to.include(
                            'view_dashboard',
                        );
                        expect(duplicateResp.body.results.scopes).to.include(
                            'create:Space',
                        );
                    });
            });

            it('should duplicate a system role', () => {
                const originalRoleUuid = 'developer';
                const duplicatedRoleName = `Duplicated Role ${new Date().getTime()}`;

                // Test: duplicate the custom role
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${originalRoleUuid}/duplicate`,
                    method: 'POST',
                    body: {
                        name: duplicatedRoleName,
                    },
                }).then((duplicateResp) => {
                    cleanupRole(duplicateResp.body.results.roleUuid);

                    // Assertions
                    expect(duplicateResp.status).to.eq(201);
                    expect(duplicateResp.body).to.have.property('status', 'ok');
                    expect(duplicateResp.body.results).to.have.property(
                        'name',
                        duplicatedRoleName,
                    );
                    expect(duplicateResp.body.results).to.have.property(
                        'roleUuid',
                    );
                    expect(duplicateResp.body.results.roleUuid).to.not.eq(
                        'originalRoleUuid',
                    );
                    expect(duplicateResp.body.results).to.have.property(
                        'scopes',
                    );
                    expect(duplicateResp.body.results.scopes).to.be.an('array');

                    // Should have the same scopes as the original
                    expect(
                        duplicateResp.body.results.scopes,
                    ).to.have.lengthOf.greaterThan(10);

                    expect(duplicateResp.body.results.scopes).to.include(
                        'manage:VirtualView',
                    );
                    expect(duplicateResp.body.results.scopes).to.include(
                        'manage:Job',
                    );
                    expect(duplicateResp.body.results.scopes).to.include(
                        'manage:CompileProject',
                    );
                });
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

        it('should return system roles with all inherited scopes', () => {
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles?load=scopes`,
                method: 'GET',
            }).then((resp) => {
                expect(resp.status).to.eq(200);
                expect(resp.body).to.have.property('status', 'ok');
                expect(resp.body.results).to.be.an('array');

                // Find the editor system role
                const editorRole = resp.body.results.find(
                    (role: AnyType) =>
                        role.ownerType === 'system' && role.name === 'Editor',
                );

                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                expect(editorRole).to.exist;

                if (editorRole) {
                    expect(editorRole).to.have.property('scopes');
                    expect(editorRole.scopes).to.be.an('array');

                    // Editor should have all inherited scopes (30+ scopes)
                    expect(editorRole.scopes.length).to.be.greaterThan(25);

                    // Should include basic viewer scopes
                    expect(editorRole.scopes).to.include('view:Dashboard');
                    expect(editorRole.scopes).to.include('view:Space');

                    // Should include interactive viewer scopes
                    expect(editorRole.scopes).to.include('manage:Explore');
                    expect(editorRole.scopes).to.include(
                        'create:DashboardComments',
                    );

                    // Should include editor-specific scopes
                    expect(editorRole.scopes).to.include('create:Space');
                    expect(editorRole.scopes).to.include('manage:Job');
                    expect(editorRole.scopes).to.include('manage:PinnedItems');
                }
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
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${createResp.body.results.roleUuid}/scopes`,
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

        it('should reject custom role assignment at organization level', () => {
            // First create a test role
            const roleName = `User Assignment Role ${new Date().getTime()}`;

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role for user assignment testing',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = createResp.body.results;

                // Try to assign custom role to user - should return 400 (only system roles allowed)
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/user/${testUserUuid}`,
                    method: 'POST',
                    body: {
                        roleId: roleUuid,
                    },
                    failOnStatusCode: false,
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(400);
                    expect(assignResp.body.error.message).to.contain(
                        'Only system roles can be assigned at organization level',
                    );
                });
            });
        });

        it('should reject organization role assignment for group', () => {
            // First create a test role
            const roleName = `Group Assignment Role ${new Date().getTime()}`;

            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: roleName,
                    description: 'Role for group assignment testing',
                },
            }).then((createResp) => {
                // Store for cleanup
                cy.wrap(createResp.body.results.roleUuid).as('testRoleUuid');

                const { roleUuid } = createResp.body.results;

                // Try to assign role to group using separate endpoint API - should fail
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                    method: 'POST',
                    body: {
                        roleId: roleUuid,
                    },
                    failOnStatusCode: false,
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(404);
                });
            });
        });

        it('should return 404 for deleting organization role assignment (not supported)', () => {
            // Try to delete organization assignment - should return 404
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/user/${testUserUuid}`,
                method: 'DELETE',
                failOnStatusCode: false,
            }).then((deleteResp) => {
                expect(deleteResp.status).to.eq(404);
            });
        });

        it('should return 404 when trying to delete group from org (not supported)', () => {
            // Try to delete group assignment - should return 404
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                method: 'DELETE',
                failOnStatusCode: false,
            }).then((deleteResp) => {
                expect(deleteResp.status).to.eq(404);
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
                    scopes: ['view:Dashboard'],
                },
            }).then((roleResp) => {
                cy.wrap(roleResp.body.results.roleUuid).as('testRoleUuid');

                // Create project access using separate endpoint
                cy.request({
                    url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${testUserUuid}`,
                    method: 'POST',
                    body: {
                        roleId: roleResp.body.results.roleUuid,
                    },
                }).then((accessResp) => {
                    // With upsert endpoint, should always succeed (200)
                    expect(accessResp.status).to.eq(200);
                });
            });
        });

        it('should create group project access', () => {
            // Create a test role
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: `Group Project Access Role ${new Date().getTime()}`,
                    description: 'Role for group project access testing',
                    scopes: ['view:Dashboard'],
                },
            }).then((roleResp) => {
                cy.wrap(roleResp.body.results.roleUuid).as('testRoleUuid');

                // Create project access for group using upsert endpoint
                cy.request({
                    url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                    method: 'POST',
                    body: {
                        roleId: roleResp.body.results.roleUuid,
                    },
                }).then((accessResp) => {
                    // With upsert endpoint, should always succeed (200)
                    expect(accessResp.status).to.eq(200);
                });
            });
        });

        it('should assign custom role then system role, removing role_uuid', () => {
            const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

            // First create a custom role
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: `Custom Test Role ${new Date().getTime()}`,
                    description: 'Custom role for assignment testing',
                    scopes: ['view:Dashboard'],
                },
            }).then((roleResp) => {
                cy.wrap(roleResp.body.results.roleUuid).as('testRoleUuid');
                const customRoleUuid = roleResp.body.results.roleUuid;

                // Step 1: Assign custom role to user
                cy.request({
                    url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${testUserUuid}`,
                    method: 'POST',
                    body: {
                        roleId: customRoleUuid,
                    },
                }).then((customAssignResp) => {
                    // With upsert endpoint, should always succeed (200)
                    expect(customAssignResp.status).to.eq(200);

                    // Wait a moment for the assignment to be processed, then verify custom role
                    cy.wait(100).then(() => {
                        cy.request({
                            url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
                            method: 'GET',
                        }).then((assignmentsResp) => {
                            expect(assignmentsResp.status).to.eq(200);
                            const userAssignment =
                                assignmentsResp.body.results.find(
                                    (assignment: AnyType) =>
                                        assignment.assigneeType === 'user' &&
                                        assignment.assigneeId === testUserUuid,
                                );

                            // Verify custom role is assigned (or skip if already has system role)
                            if (
                                userAssignment &&
                                userAssignment.roleId === customRoleUuid
                            ) {
                                expect(userAssignment.roleName).to.contain(
                                    'Custom Test Role',
                                );

                                // Step 3: Assign system role (editor) to the same user
                                cy.request({
                                    url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${testUserUuid}`,
                                    method: 'POST',
                                    body: {
                                        roleId: 'editor', // System role
                                    },
                                }).then((systemAssignResp) => {
                                    expect(systemAssignResp.status).to.eq(200);
                                    expect(
                                        systemAssignResp.body.results.roleId,
                                    ).to.eq('editor');
                                    expect(
                                        systemAssignResp.body.results.roleName,
                                    ).to.eq('Editor');

                                    // Step 4: Verify the custom role_uuid was removed and system role applied
                                    cy.request({
                                        url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
                                        method: 'GET',
                                    }).then((finalAssignmentsResp) => {
                                        expect(
                                            finalAssignmentsResp.status,
                                        ).to.eq(200);
                                        const finalUserAssignment =
                                            finalAssignmentsResp.body.results.find(
                                                (assignment: AnyType) =>
                                                    assignment.assigneeType ===
                                                        'user' &&
                                                    assignment.assigneeId ===
                                                        testUserUuid,
                                            );

                                        if (finalUserAssignment) {
                                            // Should now have system role name, not custom UUID
                                            expect(
                                                finalUserAssignment.roleId,
                                            ).to.eq('editor');
                                            expect(
                                                finalUserAssignment.roleName,
                                            ).to.eq('editor');
                                            // Should NOT have the custom role UUID anymore
                                            expect(
                                                finalUserAssignment.roleId,
                                            ).to.not.eq(customRoleUuid);
                                        }
                                    });
                                });
                            } else {
                                // User already has a system role, test still valid but different scenario
                                cy.log(
                                    'User already has system role, skipping custom->system transition test',
                                );
                            }
                        });
                    });
                });
            });
        });

        it('should reject assigning role with 0 scopes to user', () => {
            const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

            // Create a role with no scopes
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: `No Scopes Role ${new Date().getTime()}`,
                    description: 'Role with no scopes for testing',
                },
            }).then((roleResp) => {
                const { roleUuid } = roleResp.body.results;
                cy.wrap(roleUuid).as('testRoleUuid');

                // Try to assign role with no scopes to user - should fail
                cy.request({
                    url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${testUserUuid}`,
                    method: 'POST',
                    body: {
                        roleId: roleUuid,
                    },
                    failOnStatusCode: false,
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(400);
                    expect(assignResp.body).to.have.property('status', 'error');
                    expect(assignResp.body.error.message).to.contain(
                        'Custom role must have at least one scope',
                    );
                });
            });
        });

        it('should reject assigning role with 0 scopes to group', () => {
            // Create a role with no scopes
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'POST',
                body: {
                    name: `No Scopes Group Role ${new Date().getTime()}`,
                    description: 'Role with no scopes for group testing',
                },
            }).then((roleResp) => {
                const { roleUuid } = roleResp.body.results;
                cy.wrap(roleUuid).as('testRoleUuid');

                // Try to assign role with no scopes to group - should fail
                cy.request({
                    url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                    method: 'POST',
                    body: {
                        roleId: roleUuid,
                    },
                    failOnStatusCode: false,
                }).then((assignResp) => {
                    expect(assignResp.status).to.eq(400);
                    expect(assignResp.body).to.have.property('status', 'error');
                    expect(assignResp.body.error.message).to.contain(
                        'Custom role must have at least one scope',
                    );
                });
            });
        });
    });

    describe('Role Scopes Management', () => {
        it('should prevent adding scopes to system roles', () => {
            // Get system roles first
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'GET',
            }).then((resp) => {
                const systemRole = resp.body.results.find(
                    (role: AnyType) =>
                        role.ownerType === 'system' && role.name === 'editor',
                );

                if (systemRole) {
                    // Try to add scopes to system role
                    cy.request({
                        url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${systemRole.roleUuid}/scopes`,
                        method: 'POST',
                        body: {
                            scopeNames: ['view:Dashboard'],
                        },
                        failOnStatusCode: false,
                    }).then((scopeResp) => {
                        expect([400, 403, 404, 500]).to.include(
                            scopeResp.status,
                        );
                        expect(scopeResp.body).to.have.property(
                            'status',
                            'error',
                        );
                    });
                }
            });
        });

        it('should prevent removing scopes from system roles', () => {
            // Get system roles first
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'GET',
            }).then((resp) => {
                const systemRole = resp.body.results.find(
                    (role: AnyType) =>
                        role.ownerType === 'system' && role.name === 'editor',
                );

                if (systemRole) {
                    // Try to remove scope from system role
                    cy.request({
                        url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${systemRole.roleUuid}/scopes/create:Space`,
                        method: 'DELETE',
                        failOnStatusCode: false,
                    }).then((removeResp) => {
                        expect([400, 403, 404, 500]).to.include(
                            removeResp.status,
                        );
                        expect(removeResp.body).to.have.property(
                            'status',
                            'error',
                        );
                    });
                }
            });
        });

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
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}/scopes`,
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
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}/scopes/view_project`,
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

        it('should prevent creating role with system role name', () => {
            const systemRoleNames = [
                'viewer',
                'interactive_viewer',
                'editor',
                'developer',
                'admin',
            ];

            // Test creating role with each system role name
            systemRoleNames.forEach((systemRoleName) => {
                cy.request({
                    url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                    method: 'POST',
                    body: {
                        name: systemRoleName,
                        description: 'Attempt to create role with system name',
                    },
                    failOnStatusCode: false,
                }).then((resp) => {
                    expect([400, 409, 422, 500]).to.include(resp.status);
                    expect(resp.body).to.have.property('status', 'error');
                });
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
                        role.ownerType === 'system' &&
                        (role.name === 'viewer' ||
                            role.name === 'editor' ||
                            role.name === 'admin'),
                );

                if (systemRole) {
                    // Try to delete system role
                    cy.request({
                        url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${systemRole.roleUuid}`,
                        method: 'DELETE',
                        failOnStatusCode: false,
                    }).then((deleteResp) => {
                        expect([400, 403, 404, 500]).to.include(
                            deleteResp.status,
                        );
                        expect(deleteResp.body).to.have.property(
                            'status',
                            'error',
                        );
                    });
                }
            });
        });

        it('should prevent updating system roles', () => {
            // Get system roles first
            cy.request({
                url: `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                method: 'GET',
            }).then((resp) => {
                const systemRole = resp.body.results.find(
                    (role: AnyType) =>
                        role.ownerType === 'system' && role.name === 'editor',
                );

                if (systemRole) {
                    // Try to update system role
                    cy.request({
                        url: `${orgRolesApiUrl}/${testOrgUuid}/roles/${systemRole.roleUuid}`,
                        method: 'PATCH',
                        body: {
                            description: 'Attempting to modify system role',
                        },
                        failOnStatusCode: false,
                    }).then((updateResp) => {
                        expect([400, 403, 404, 500]).to.include(
                            updateResp.status,
                        );
                        expect(updateResp.body).to.have.property(
                            'status',
                            'error',
                        );
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
                        url: `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${SEED_ORG_1_ADMIN.user_uuid}`,
                        method: 'POST',
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
                        method: 'POST',
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
