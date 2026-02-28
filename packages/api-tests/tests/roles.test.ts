import {
    AnyType,
    SEED_GROUP,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { Body } from '../helpers/api-client';
import { anotherLogin, login, loginWithPermissions } from '../helpers/auth';

type RoleResult = {
    roleUuid: string;
    name: string;
    description: string;
    organizationUuid: string;
    ownerType: string;
    scopes: string[];
};
type AssignmentResult = {
    assigneeType: string;
    assigneeId: string;
    roleId: string;
    roleName: string;
};
type ErrorBody = { status: string; error: { message: string } };

const orgRolesApiUrl = '/api/v2/orgs';
const projectRolesApiUrl = '/api/v2/projects';

describe('Roles API Tests', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    const testOrgUuid = SEED_ORG_1.organization_uuid;

    /** Role UUIDs created during each test, cleaned up in afterEach */
    let rolesToCleanup: string[] = [];

    beforeAll(async () => {
        admin = await login();
    });

    afterEach(async () => {
        // Clean up test roles
        for (const roleUuid of rolesToCleanup) {
            await admin.delete(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}`,
                { failOnStatusCode: false },
            );
        }
        rolesToCleanup = [];
    });

    describe('Organization Roles', () => {
        it('should create a custom role in organization', async () => {
            const roleName = `Custom Role ${Date.now()}`;
            const roleDescription = 'Test role created by integration test';

            const resp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: roleName,
                    description: roleDescription,
                },
            );

            expect(resp.status).toBe(201);
            expect(resp.body).toHaveProperty('status', 'ok');
            expect(resp.body.results).toHaveProperty('name', roleName);
            expect(resp.body.results).toHaveProperty(
                'description',
                roleDescription,
            );
            expect(resp.body.results).toHaveProperty('roleUuid');
            expect(resp.body.results).toHaveProperty(
                'organizationUuid',
                testOrgUuid,
            );

            rolesToCleanup.push(resp.body.results.roleUuid);
        });

        describe('Duplicate Role', () => {
            it('should duplicate a system role', async () => {
                const newRoleName = `Copy of Editor ${Date.now()}`;

                const resp = await admin.post<Body<RoleResult>>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles/editor/duplicate`,
                    { name: newRoleName },
                );

                expect(resp.status).toBe(201);
                expect(resp.body).toHaveProperty('status', 'ok');
                expect(resp.body.results).toHaveProperty('name', newRoleName);
                expect(resp.body.results).toHaveProperty('roleUuid');
                expect(resp.body.results).toHaveProperty('scopes');
                expect(resp.body.results.scopes).toBeInstanceOf(Array);
                // Editor should have scopes
                expect(resp.body.results.scopes.length).toBeGreaterThan(0);

                // Should include editor scopes
                expect(resp.body.results.scopes).toContain('create:Space');
                expect(resp.body.results.scopes).toContain('manage:Job');

                rolesToCleanup.push(resp.body.results.roleUuid);
            });

            it('should add scopes to a custom role', async () => {
                const roleName = `Test Role ${Date.now()}`;

                // Setup: create a custom role
                const createResp = await admin.post<Body<RoleResult>>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                    {
                        name: roleName,
                        description: 'Test role for scopes',
                    },
                );
                expect(createResp.status).toBe(201);
                const { roleUuid } = createResp.body.results;
                rolesToCleanup.push(roleUuid);

                // Test: add scopes to the role
                const scopeResp = await admin.post<Body<unknown>>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}/scopes`,
                    { scopeNames: ['view_project', 'view_dashboard'] },
                );

                expect(scopeResp.status).toBe(200);
                expect(scopeResp.body).toHaveProperty('status', 'ok');
            });

            it('should duplicate a custom role with scopes', async () => {
                const originalRoleName = `Original Role ${Date.now()}`;
                const duplicatedRoleName = `Duplicated Role ${Date.now()}`;

                // Setup: create a custom role
                const createResp = await admin.post<Body<RoleResult>>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                    {
                        name: originalRoleName,
                        description: 'Original role to be duplicated',
                    },
                );
                const originalRoleUuid = createResp.body.results.roleUuid;
                rolesToCleanup.push(originalRoleUuid);

                // Setup: add scopes to the original role
                await admin.post<Body<unknown>>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles/${originalRoleUuid}/scopes`,
                    {
                        scopeNames: [
                            'view_project',
                            'view_dashboard',
                            'create:Space',
                        ],
                    },
                );

                // Test: duplicate the custom role
                const duplicateResp = await admin.post<Body<RoleResult>>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles/${originalRoleUuid}/duplicate`,
                    { name: duplicatedRoleName },
                );

                rolesToCleanup.push(duplicateResp.body.results.roleUuid);

                expect(duplicateResp.status).toBe(201);
                expect(duplicateResp.body).toHaveProperty('status', 'ok');
                expect(duplicateResp.body.results).toHaveProperty(
                    'name',
                    duplicatedRoleName,
                );
                expect(duplicateResp.body.results).toHaveProperty('roleUuid');
                expect(duplicateResp.body.results.roleUuid).not.toBe(
                    originalRoleUuid,
                );
                expect(duplicateResp.body.results).toHaveProperty('scopes');
                expect(duplicateResp.body.results.scopes).toBeInstanceOf(Array);

                // Should have the same scopes as the original
                expect(duplicateResp.body.results.scopes).toHaveLength(3);
                expect(duplicateResp.body.results.scopes).toContain(
                    'view_project',
                );
                expect(duplicateResp.body.results.scopes).toContain(
                    'view_dashboard',
                );
                expect(duplicateResp.body.results.scopes).toContain(
                    'create:Space',
                );
            });

            it('should duplicate a system role (developer)', async () => {
                const originalRoleUuid = 'developer';
                const duplicatedRoleName = `Duplicated Role ${Date.now()}`;

                const duplicateResp = await admin.post<Body<RoleResult>>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles/${originalRoleUuid}/duplicate`,
                    { name: duplicatedRoleName },
                );

                rolesToCleanup.push(duplicateResp.body.results.roleUuid);

                expect(duplicateResp.status).toBe(201);
                expect(duplicateResp.body).toHaveProperty('status', 'ok');
                expect(duplicateResp.body.results).toHaveProperty(
                    'name',
                    duplicatedRoleName,
                );
                expect(duplicateResp.body.results).toHaveProperty('roleUuid');
                expect(duplicateResp.body.results.roleUuid).not.toBe(
                    'originalRoleUuid',
                );
                expect(duplicateResp.body.results).toHaveProperty('scopes');
                expect(duplicateResp.body.results.scopes).toBeInstanceOf(Array);

                // Should have the same scopes as the original
                expect(
                    duplicateResp.body.results.scopes.length,
                ).toBeGreaterThan(10);

                expect(duplicateResp.body.results.scopes).toContain(
                    'manage:VirtualView',
                );
                expect(duplicateResp.body.results.scopes).toContain(
                    'manage:Job',
                );
                expect(duplicateResp.body.results.scopes).toContain(
                    'manage:CompileProject',
                );
            });
        });

        it('should list organization roles without scopes', async () => {
            const createResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `Custom Role ${Date.now()}`,
                    description: 'Custom role description',
                },
            );
            expect(createResp.status).toBe(201);
            rolesToCleanup.push(createResp.body.results.roleUuid);

            const resp = await admin.get<Body<RoleResult[]>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
            );

            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
            expect(resp.body.results).toBeInstanceOf(Array);
            // Should include system roles like admin, member, etc.
            expect(resp.body.results.length).toBeGreaterThan(0);
        });

        it('should return system roles with all inherited scopes', async () => {
            const resp = await admin.get<Body<RoleResult[]>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles?load=scopes`,
            );

            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
            expect(resp.body.results).toBeInstanceOf(Array);

            // Find the editor system role
            const editorRole = resp.body.results.find(
                (role: AnyType) =>
                    role.ownerType === 'system' && role.name === 'Editor',
            );

            expect(editorRole).toBeDefined();

            if (editorRole) {
                expect(editorRole).toHaveProperty('scopes');
                expect(editorRole.scopes).toBeInstanceOf(Array);

                // Editor should have all inherited scopes (30+ scopes)
                expect(editorRole.scopes.length).toBeGreaterThan(25);

                // Should include basic viewer scopes
                expect(editorRole.scopes).toContain('view:Dashboard');
                expect(editorRole.scopes).toContain('view:Space');

                // Should include interactive viewer scopes
                expect(editorRole.scopes).toContain('manage:Explore');
                expect(editorRole.scopes).toContain('create:DashboardComments');

                // Should include editor-specific scopes
                expect(editorRole.scopes).toContain('create:Space');
                expect(editorRole.scopes).toContain('manage:Job');
                expect(editorRole.scopes).toContain('manage:PinnedItems');
            }
        });

        it('should list organization roles with scopes', async () => {
            const createResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `Custom Role ${Date.now()}`,
                    description: 'Custom role description',
                },
            );
            expect(createResp.status).toBe(201);
            const { roleUuid } = createResp.body.results;
            rolesToCleanup.push(roleUuid);

            // Add scopes to role
            const scopeResp = await admin.post<Body<unknown>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}/scopes`,
                { scopeNames: ['view_project', 'view_dashboard'] },
            );
            expect(scopeResp.status).toBe(200);
            expect(scopeResp.body).toHaveProperty('status', 'ok');

            const resp = await admin.get<Body<RoleResult[]>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles?load=scopes`,
            );

            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
            expect(resp.body.results).toBeInstanceOf(Array);
            expect(resp.body.results.length).toBeGreaterThan(0);

            const roleWithScopes = resp.body.results.find(
                (role: AnyType) => role.roleUuid === roleUuid,
            );
            expect(roleWithScopes).toBeDefined();
            expect(roleWithScopes!.scopes).toBeInstanceOf(Array);
            expect(roleWithScopes!.scopes).toContain('view_project');
            expect(roleWithScopes!.scopes).toContain('view_dashboard');
        });

        it('should forbid listing roles from different organization', async () => {
            const other = await anotherLogin();
            const resp = await other.get(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(403);
        });

        it('should update a custom role', async () => {
            const roleName = `Updatable Role ${Date.now()}`;

            const createResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: roleName,
                    description: 'Original description',
                },
            );
            const { roleUuid } = createResp.body.results;
            rolesToCleanup.push(roleUuid);

            const updatedDescription = 'Updated description';

            const updateResp = await admin.patch<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}`,
                { description: updatedDescription },
            );

            expect(updateResp.status).toBe(200);
            expect(updateResp.body.results).toHaveProperty(
                'description',
                updatedDescription,
            );
            expect(updateResp.body.results).toHaveProperty('name', roleName);
        });

        it('should delete a custom role', async () => {
            const roleName = `Deletable Role ${Date.now()}`;

            const createResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: roleName,
                    description: 'Role to be deleted',
                },
            );
            const { roleUuid } = createResp.body.results;

            const deleteResp = await admin.delete(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}`,
            );

            expect(deleteResp.status).toBe(200);
            expect(deleteResp.body).toHaveProperty('status', 'ok');
        });
    });

    describe('Unified Role Assignments', () => {
        const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

        it('should reject custom role assignment at organization level', async () => {
            const roleName = `User Assignment Role ${Date.now()}`;

            const createResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: roleName,
                    description: 'Role for user assignment testing',
                },
            );
            const { roleUuid } = createResp.body.results;
            rolesToCleanup.push(roleUuid);

            // Try to assign custom role to user - should return 400 (only system roles allowed)
            const assignResp = await admin.post<ErrorBody>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/user/${testUserUuid}`,
                { roleId: roleUuid },
                { failOnStatusCode: false },
            );

            expect(assignResp.status).toBe(400);
            expect(assignResp.body.error.message).toContain(
                'Only system roles can be assigned at organization level',
            );
        });

        it('should reject organization role assignment for group', async () => {
            const roleName = `Group Assignment Role ${Date.now()}`;

            const createResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: roleName,
                    description: 'Role for group assignment testing',
                },
            );
            const { roleUuid } = createResp.body.results;
            rolesToCleanup.push(roleUuid);

            // Try to assign role to group using separate endpoint API - should fail
            const assignResp = await admin.post<ErrorBody>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                { roleId: roleUuid },
                { failOnStatusCode: false },
            );

            expect(assignResp.status).toBe(404);
        });

        it('should return 404 for deleting organization role assignment (not supported)', async () => {
            const deleteResp = await admin.delete(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/user/${testUserUuid}`,
                { failOnStatusCode: false },
            );
            expect(deleteResp.status).toBe(404);
        });

        it('should return 404 when trying to delete group from org (not supported)', async () => {
            const deleteResp = await admin.delete(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                { failOnStatusCode: false },
            );
            expect(deleteResp.status).toBe(404);
        });
    });

    describe('Project Access Management', () => {
        afterEach(async () => {
            // Clean up project access to avoid polluting other tests
            await admin.delete(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${SEED_ORG_1_ADMIN.user_uuid}`,
                { failOnStatusCode: false },
            );
            await admin.delete(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                { failOnStatusCode: false },
            );
        });

        it('should get project access information', async () => {
            const resp = await admin.get<Body<AssignmentResult[]>>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
            );

            expect(resp.status).toBe(200);
            expect(resp.body).toHaveProperty('status', 'ok');
            expect(resp.body.results).toBeInstanceOf(Array);
        });

        it('should create user project access', async () => {
            const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

            // Create a test role
            const roleResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `Project Access Role ${Date.now()}`,
                    description: 'Role for project access testing',
                    scopes: ['view:Dashboard'],
                },
            );
            rolesToCleanup.push(roleResp.body.results.roleUuid);

            // Create project access using separate endpoint
            const accessResp = await admin.post<Body<unknown>>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${testUserUuid}`,
                { roleId: roleResp.body.results.roleUuid },
            );

            // With upsert endpoint, should always succeed (200)
            expect(accessResp.status).toBe(200);
        });

        it('should create group project access', async () => {
            // Create a test role
            const roleResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `Group Project Access Role ${Date.now()}`,
                    description: 'Role for group project access testing',
                    scopes: ['view:Dashboard'],
                },
            );
            rolesToCleanup.push(roleResp.body.results.roleUuid);

            // Create project access for group using upsert endpoint
            const accessResp = await admin.post<Body<unknown>>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                { roleId: roleResp.body.results.roleUuid },
            );

            // With upsert endpoint, should always succeed (200)
            expect(accessResp.status).toBe(200);
        });

        it('should assign custom role then system role, removing role_uuid', async () => {
            const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

            // First create a custom role
            const roleResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `Custom Test Role ${Date.now()}`,
                    description: 'Custom role for assignment testing',
                    scopes: ['view:Dashboard'],
                },
            );
            const customRoleUuid = roleResp.body.results.roleUuid;
            rolesToCleanup.push(customRoleUuid);

            // Step 1: Assign custom role to user
            const customAssignResp = await admin.post<Body<unknown>>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${testUserUuid}`,
                { roleId: customRoleUuid },
            );
            expect(customAssignResp.status).toBe(200);

            // Verify custom role assignment
            const assignmentsResp = await admin.get<Body<AssignmentResult[]>>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
            );
            expect(assignmentsResp.status).toBe(200);

            const userAssignment = assignmentsResp.body.results.find(
                (assignment: AnyType) =>
                    assignment.assigneeType === 'user' &&
                    assignment.assigneeId === testUserUuid,
            );

            if (userAssignment && userAssignment.roleId === customRoleUuid) {
                expect(userAssignment.roleName).toContain('Custom Test Role');

                // Step 2: Assign system role (editor) to the same user
                const systemAssignResp = await admin.post<
                    Body<AssignmentResult>
                >(
                    `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${testUserUuid}`,
                    { roleId: 'editor' },
                );
                expect(systemAssignResp.status).toBe(200);
                expect(systemAssignResp.body.results.roleId).toBe('editor');
                expect(systemAssignResp.body.results.roleName).toBe('Editor');

                // Step 3: Verify the custom role_uuid was removed and system role applied
                const finalAssignmentsResp = await admin.get<
                    Body<AssignmentResult[]>
                >(
                    `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
                );
                expect(finalAssignmentsResp.status).toBe(200);

                const finalUserAssignment =
                    finalAssignmentsResp.body.results.find(
                        (assignment: AnyType) =>
                            assignment.assigneeType === 'user' &&
                            assignment.assigneeId === testUserUuid,
                    );

                if (finalUserAssignment) {
                    // Should now have system role name, not custom UUID
                    expect(finalUserAssignment.roleId).toBe('editor');
                    expect(finalUserAssignment.roleName).toBe('editor');
                    // Should NOT have the custom role UUID anymore
                    expect(finalUserAssignment.roleId).not.toBe(customRoleUuid);
                }
            }
        });

        it('should clear role_uuid when switching to system role via v1 API', async () => {
            const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

            // Step 1: Create a custom role with scopes
            const roleResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `V1 Update Cleanup ${Date.now()}`,
                    description:
                        'Role to verify v1 API clears role_uuid on system role change',
                    scopes: ['view:Dashboard'],
                },
            );
            const customRoleUuid = roleResp.body.results.roleUuid;
            rolesToCleanup.push(customRoleUuid);

            // Step 2: Assign custom role to user via v2 API
            const assignResp = await admin.post<Body<AssignmentResult>>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${testUserUuid}`,
                { roleId: customRoleUuid },
            );
            expect(assignResp.status).toBe(200);

            // Verify the custom role is assigned
            const beforeResp = await admin.get<Body<AssignmentResult[]>>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
            );
            const beforeAssignment = beforeResp.body.results.find(
                (a: AnyType) =>
                    a.assigneeType === 'user' &&
                    a.assigneeId === testUserUuid,
            );
            expect(beforeAssignment).toBeDefined();
            expect(beforeAssignment!.roleId).toBe(customRoleUuid);

            // Step 3: Switch user to system role via deprecated v1 API.
            // The v1 endpoint must clear role_uuid when changing to a system
            // role, otherwise the stale FK reference blocks role deletion.
            const v1UpdateResp = await admin.patch<Body<unknown>>(
                `/api/v1/projects/${SEED_PROJECT.project_uuid}/access/${testUserUuid}`,
                { role: 'editor' },
            );
            expect(v1UpdateResp.status).toBe(200);

            // Step 4: Verify the role_uuid was cleared - role assignment
            // should show system role, not the custom role UUID
            const afterResp = await admin.get<Body<AssignmentResult[]>>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
            );
            const afterAssignment = afterResp.body.results.find(
                (a: AnyType) =>
                    a.assigneeType === 'user' &&
                    a.assigneeId === testUserUuid,
            );
            expect(afterAssignment).toBeDefined();
            // The role should now be the system role, not the custom role UUID
            expect(afterAssignment!.roleId).toBe('editor');

            // Step 5: Delete the custom role - should succeed because the v1
            // update should have cleared the role_uuid FK reference
            const deleteRoleResp = await admin.delete<Body<unknown>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/${customRoleUuid}`,
                { failOnStatusCode: false },
            );
            expect(deleteRoleResp.status).toBe(200);

            // Remove from cleanup since we already deleted it
            rolesToCleanup = rolesToCleanup.filter(
                (uuid) => uuid !== customRoleUuid,
            );
        });

        it('should reject assigning role with 0 scopes to user', async () => {
            const testUserUuid = SEED_ORG_1_ADMIN.user_uuid;

            // Create a role with no scopes
            const roleResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `No Scopes Role ${Date.now()}`,
                    description: 'Role with no scopes for testing',
                },
            );
            const { roleUuid } = roleResp.body.results;
            rolesToCleanup.push(roleUuid);

            // Try to assign role with no scopes to user - should fail
            const assignResp = await admin.post<ErrorBody>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${testUserUuid}`,
                { roleId: roleUuid },
                { failOnStatusCode: false },
            );

            expect(assignResp.status).toBe(400);
            expect(assignResp.body).toHaveProperty('status', 'error');
            expect(assignResp.body.error.message).toContain(
                'Custom role must have at least one scope',
            );
        });

        it('should reject assigning role with 0 scopes to group', async () => {
            // Create a role with no scopes
            const roleResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `No Scopes Group Role ${Date.now()}`,
                    description: 'Role with no scopes for group testing',
                },
            );
            const { roleUuid } = roleResp.body.results;
            rolesToCleanup.push(roleUuid);

            // Try to assign role with no scopes to group - should fail
            const assignResp = await admin.post<ErrorBody>(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/group/${SEED_GROUP.groupUuid}`,
                { roleId: roleUuid },
                { failOnStatusCode: false },
            );

            expect(assignResp.status).toBe(400);
            expect(assignResp.body).toHaveProperty('status', 'error');
            expect(assignResp.body.error.message).toContain(
                'Custom role must have at least one scope',
            );
        });
    });

    describe('Role Scopes Management', () => {
        it('should prevent adding scopes to system roles', async () => {
            const resp = await admin.get<Body<RoleResult[]>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
            );

            const systemRole = resp.body.results.find(
                (role: AnyType) =>
                    role.ownerType === 'system' && role.name === 'editor',
            );

            if (systemRole) {
                const scopeResp = await admin.post<Body<unknown>>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles/${systemRole.roleUuid}/scopes`,
                    { scopeNames: ['view:Dashboard'] },
                    { failOnStatusCode: false },
                );

                expect([400, 403, 404, 500]).toContain(scopeResp.status);
                expect(scopeResp.body).toHaveProperty('status', 'error');
            }
        });

        it('should prevent removing scopes from system roles', async () => {
            const resp = await admin.get<Body<RoleResult[]>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
            );

            const systemRole = resp.body.results.find(
                (role: AnyType) =>
                    role.ownerType === 'system' && role.name === 'editor',
            );

            if (systemRole) {
                const removeResp = await admin.delete(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles/${systemRole.roleUuid}/scopes/create:Space`,
                    { failOnStatusCode: false },
                );

                expect([400, 403, 404, 500]).toContain(removeResp.status);
                expect(removeResp.body).toHaveProperty('status', 'error');
            }
        });

        it('should add scopes to role', async () => {
            const roleName = `Scoped Role ${Date.now()}`;

            const createResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: roleName,
                    description: 'Role for scope testing',
                },
            );
            const { roleUuid } = createResp.body.results;
            rolesToCleanup.push(roleUuid);

            // Add scopes to role
            const scopeResp = await admin.post<Body<unknown>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}/scopes`,
                { scopeNames: ['view_project', 'view_dashboard'] },
            );
            expect(scopeResp.status).toBe(200);
            expect(scopeResp.body).toHaveProperty('status', 'ok');

            // Remove a scope from role
            const removeResp = await admin.delete(
                `${orgRolesApiUrl}/${testOrgUuid}/roles/${roleUuid}/scopes/view_project`,
            );
            expect(removeResp.status).toBe(200);
            expect(removeResp.body).toHaveProperty('status', 'ok');
        });
    });

    describe('Authorization and Security', () => {
        it('should prevent unauthorized users from managing roles', async () => {
            const other = await anotherLogin();

            // Try to create a role in the original org
            const resp = await other.post(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: 'Unauthorized Role',
                    description: 'This should fail',
                },
                { failOnStatusCode: false },
            );

            expect(resp.status).toBe(403);
        });

        it('should validate role creation with empty name', async () => {
            const resp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: '',
                    description: 'Role with empty name',
                },
                { failOnStatusCode: false },
            );

            expect([400, 422]).toContain(resp.status);
        });

        it('should prevent creating role with system role name', async () => {
            const systemRoleNames = [
                'viewer',
                'interactive_viewer',
                'editor',
                'developer',
                'admin',
            ];

            for (const systemRoleName of systemRoleNames) {
                const resp = await admin.post<Body<RoleResult>>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                    {
                        name: systemRoleName,
                        description: 'Attempt to create role with system name',
                    },
                    { failOnStatusCode: false },
                );

                expect([400, 409, 422, 500]).toContain(resp.status);
                expect(resp.body).toHaveProperty('status', 'error');
            }
        });

        it('should prevent deleting system roles', async () => {
            const resp = await admin.get<Body<RoleResult[]>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
            );

            const systemRole = resp.body.results.find(
                (role: AnyType) =>
                    role.ownerType === 'system' &&
                    (role.name === 'viewer' ||
                        role.name === 'editor' ||
                        role.name === 'admin'),
            );

            if (systemRole) {
                const deleteResp = await admin.delete(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles/${systemRole.roleUuid}`,
                    { failOnStatusCode: false },
                );

                expect([400, 403, 404, 500]).toContain(deleteResp.status);
                expect(deleteResp.body).toHaveProperty('status', 'error');
            }
        });

        it('should prevent updating system roles', async () => {
            const resp = await admin.get<Body<RoleResult[]>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
            );

            const systemRole = resp.body.results.find(
                (role: AnyType) =>
                    role.ownerType === 'system' && role.name === 'editor',
            );

            if (systemRole) {
                const updateResp = await admin.patch<ErrorBody>(
                    `${orgRolesApiUrl}/${testOrgUuid}/roles/${systemRole.roleUuid}`,
                    { description: 'Attempting to modify system role' },
                    { failOnStatusCode: false },
                );

                expect([400, 403, 404, 500]).toContain(updateResp.status);
                expect(updateResp.body).toHaveProperty('status', 'error');
            }
        });
    });

    describe('Project Permission Checks', () => {
        it('should forbid viewer from creating roles', async () => {
            const { client: viewer } = await loginWithPermissions('member', [
                {
                    role: 'viewer',
                    projectUuid: SEED_PROJECT.project_uuid,
                },
            ]);

            const resp = await viewer.post(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `Unauthorized Role ${Date.now()}`,
                    description: 'This should fail',
                },
                { failOnStatusCode: false },
            );

            expect(resp.status).toBe(403);
        });

        it('should forbid viewer from getting project access', async () => {
            const { client: viewer } = await loginWithPermissions('member', [
                {
                    role: 'viewer',
                    projectUuid: SEED_PROJECT.project_uuid,
                },
            ]);

            const resp = await viewer.get(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments`,
                { failOnStatusCode: false },
            );

            expect(resp.status).toBe(403);
        });

        it('should forbid viewer from creating user project access', async () => {
            // First create a role as admin
            const roleResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `Test Role ${Date.now()}`,
                    description: 'Test role for permission testing',
                },
            );
            const { roleUuid } = roleResp.body.results;
            rolesToCleanup.push(roleUuid);

            const { client: viewer } = await loginWithPermissions('member', [
                {
                    role: 'viewer',
                    projectUuid: SEED_PROJECT.project_uuid,
                },
            ]);

            const resp = await viewer.post(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${SEED_ORG_1_ADMIN.user_uuid}`,
                { roleId: roleUuid },
                { failOnStatusCode: false },
            );

            expect(resp.status).toBe(403);
        });

        it('should forbid viewer from updating user project access', async () => {
            // First create a role as admin
            const roleResp = await admin.post<Body<RoleResult>>(
                `${orgRolesApiUrl}/${testOrgUuid}/roles`,
                {
                    name: `Update Test Role ${Date.now()}`,
                    description: 'Test role for update permission testing',
                },
            );
            const { roleUuid } = roleResp.body.results;
            rolesToCleanup.push(roleUuid);

            const { client: viewer } = await loginWithPermissions('member', [
                {
                    role: 'viewer',
                    projectUuid: SEED_PROJECT.project_uuid,
                },
            ]);

            // Try to update project access as viewer
            const resp = await viewer.post(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${SEED_ORG_1_ADMIN.user_uuid}`,
                { roleId: roleUuid },
                { failOnStatusCode: false },
            );

            expect(resp.status).toBe(403);
        });

        it('should forbid viewer from removing user project access', async () => {
            const { client: viewer } = await loginWithPermissions('member', [
                {
                    role: 'viewer',
                    projectUuid: SEED_PROJECT.project_uuid,
                },
            ]);

            // Try to remove project access as viewer
            const resp = await viewer.delete(
                `${projectRolesApiUrl}/${SEED_PROJECT.project_uuid}/roles/assignments/user/${SEED_ORG_1_ADMIN.user_uuid}`,
                { failOnStatusCode: false },
            );

            expect(resp.status).toBe(403);
        });
    });
});
