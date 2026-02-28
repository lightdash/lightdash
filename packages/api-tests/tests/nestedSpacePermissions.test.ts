import {
    SEED_ORG_1_EDITOR,
    SEED_PROJECT,
    SpaceMemberRole,
    type Space,
    type SpaceDeleteImpact,
    type SpaceShare,
} from '@lightdash/common';
import { type Body } from '../helpers/api-client';
import { login, loginAsEditor } from '../helpers/auth';

const apiUrl = '/api/v1';

describe('Nested Space Permission Inheritance - API Tests', () => {
    describe('Default Inheritance Behavior', () => {
        let admin: Awaited<ReturnType<typeof login>>;
        let parentSpaceUuid: string | undefined;

        beforeAll(async () => {
            admin = await login();
        });

        afterEach(async () => {
            if (parentSpaceUuid) {
                await admin
                    .delete(
                        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${parentSpaceUuid}`,
                        { failOnStatusCode: false },
                    )
                    .catch(() => {});
                parentSpaceUuid = undefined;
            }
        });

        it('should create root space with inheritParentPermissions=false by default', async () => {
            const resp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Test Parent ${Date.now()}` },
            );
            const space = resp.body.results;
            parentSpaceUuid = space.uuid;

            expect(space.inheritParentPermissions).toBe(false);
            expect(space.isPrivate).toBe(true);
            expect(space.parentSpaceUuid).toBeNull();
        });

        it('should create root space with explicit inheritParentPermissions=true', async () => {
            const resp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Test Parent ${Date.now()}`,
                    inheritParentPermissions: true,
                },
            );
            const space = resp.body.results;
            parentSpaceUuid = space.uuid;

            expect(space.inheritParentPermissions).toBe(true);
            expect(space.isPrivate).toBe(false);
            expect(space.parentSpaceUuid).toBeNull();
        });

        it('should create nested space with inheritParentPermissions=true by default', async () => {
            const timestamp = Date.now();

            const parentResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Test Parent ${timestamp}` },
            );
            parentSpaceUuid = parentResp.body.results.uuid;

            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Test Child ${timestamp}`,
                    parentSpaceUuid,
                },
            );
            const child = childResp.body.results;

            expect(child.inheritParentPermissions).toBe(true);
            expect(child.parentSpaceUuid).toBe(parentSpaceUuid);
        });

        it('should create nested space with explicit inheritParentPermissions=false', async () => {
            const timestamp = Date.now();

            const parentResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Test Parent ${timestamp}` },
            );
            parentSpaceUuid = parentResp.body.results.uuid;

            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Test Child ${timestamp}`,
                    parentSpaceUuid,
                    inheritParentPermissions: false,
                },
            );
            const child = childResp.body.results;

            expect(child.inheritParentPermissions).toBe(false);
            expect(child.parentSpaceUuid).toBe(parentSpaceUuid);
        });
    });

    describe('Permission Inheritance Chain', () => {
        let admin: Awaited<ReturnType<typeof login>>;
        let rootSpaceUuid: string | undefined;

        beforeAll(async () => {
            admin = await login();
        });

        afterEach(async () => {
            if (rootSpaceUuid) {
                await admin
                    .delete(
                        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}`,
                        { failOnStatusCode: false },
                    )
                    .catch(() => {});
                rootSpaceUuid = undefined;
            }
        });

        it('should inherit permissions from parent space', async () => {
            const timestamp = Date.now();

            // Create root space
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Add editor user to root space
            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Create child that inherits
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: true,
                },
            );
            const child = childResp.body.results;

            // Get child space details
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
            );
            const childWithAccess = resp.body.results;

            // Child should have editor's access via inheritance
            const editorAccess = childWithAccess.access.find(
                (a: SpaceShare) => a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
            );

            expect(editorAccess).toBeDefined();
            expect(editorAccess?.role).toBe(SpaceMemberRole.EDITOR);
            // Inherited access should have hasDirectAccess=false
            expect(editorAccess?.hasDirectAccess).toBe(false);
        });

        it('should aggregate permissions through multiple levels of nesting', async () => {
            const timestamp = Date.now();

            // Create a 3-level hierarchy
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Add editor to root as VIEWER
            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.VIEWER,
                },
            );

            // Create child
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                },
            );
            const child = childResp.body.results;

            // Upgrade editor to EDITOR on child
            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Create grandchild
            const grandchildResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Grandchild ${timestamp}`,
                    parentSpaceUuid: child.uuid,
                },
            );
            const grandchild = grandchildResp.body.results;

            // Check grandchild permissions
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${grandchild.uuid}`,
            );
            const gcWithAccess = resp.body.results;

            // Editor should have EDITOR (highest role from chain)
            const editorAccess = gcWithAccess.access.find(
                (a: SpaceShare) => a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
            );

            expect(editorAccess).toBeDefined();
            expect(editorAccess?.role).toBe(SpaceMemberRole.EDITOR);
        });

        it('should inherit project/org permissions when both child and root created with inheritParentPermissions=true', async () => {
            const timestamp = Date.now();

            // Create root with inheritParentPermissions=true
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Root ${timestamp}`,
                    inheritParentPermissions: true,
                },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Create child with inheritParentPermissions=true
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: true,
                },
            );
            const child = childResp.body.results;

            // Check child - editor should have access via project/org role
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
            );
            const childSpace = resp.body.results;

            const editorAccess = childSpace.access.find(
                (a: SpaceShare) => a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
            );

            expect(editorAccess).toBeDefined();
            expect(editorAccess?.role).toBe(SpaceMemberRole.EDITOR);
        });
    });

    describe('Breaking Inheritance', () => {
        let admin: Awaited<ReturnType<typeof login>>;
        let rootSpaceUuid: string | undefined;

        beforeAll(async () => {
            admin = await login();
        });

        afterEach(async () => {
            if (rootSpaceUuid) {
                await admin
                    .delete(
                        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}`,
                        { failOnStatusCode: false },
                    )
                    .catch(() => {});
                rootSpaceUuid = undefined;
            }
        });

        it('should copy permissions when setting inheritParentPermissions=false', async () => {
            const timestamp = Date.now();

            // Create root with editor access
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Create inheriting child
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: true,
                },
            );
            const child = childResp.body.results;

            // Break inheritance
            const updateResp = await admin.patch<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                {
                    name: child.name,
                    inheritParentPermissions: false,
                },
            );
            const updatedChild = updateResp.body.results;
            expect(updatedChild.inheritParentPermissions).toBe(false);

            // Editor should now have direct access (copied from inheritance)
            const editorAccess = updatedChild.access.find(
                (a: SpaceShare) => a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
            );

            expect(editorAccess).toBeDefined();
            // After breaking, access should be direct
            expect(editorAccess?.hasDirectAccess).toBe(true);
        });

        it('should not inherit project/org permissions when child is created with inheritParentPermissions=true and root has inheritParentPermissions=false', async () => {
            const timestamp = Date.now();

            // Create root with inheritParentPermissions=false (default)
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Root ${timestamp}`,
                    inheritParentPermissions: false,
                },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Create child with inheritParentPermissions=true
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: true,
                },
            );
            const child = childResp.body.results;

            // Check child - editor should NOT have access
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
            );
            const childSpace = resp.body.results;

            const editorAccess = childSpace.access.find(
                (a: SpaceShare) => a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
            );

            expect(editorAccess).toBeUndefined();
        });

        it('should not inherit new parent permissions when child is created with inheritParentPermissions=false', async () => {
            const timestamp = Date.now();

            // Create root
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Create child with broken inheritance
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: false,
                },
            );
            const child = childResp.body.results;

            // Now add editor to root AFTER creating the child
            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Check child - editor should NOT have access
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
            );
            const childSpace = resp.body.results;

            const editorAccess = childSpace.access.find(
                (a: SpaceShare) => a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
            );

            expect(editorAccess).toBeUndefined();
        });

        it('should not inherit new parent permissions after breaking inheritance with PATCH', async () => {
            const timestamp = Date.now();

            // Create root
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Create child with inheritance
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: true,
                },
            );
            const child = childResp.body.results;

            // Break inheritance via PATCH
            await admin.patch(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                {
                    name: child.name,
                    inheritParentPermissions: false,
                },
            );

            // Now add editor to root AFTER breaking inheritance
            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Check child - editor should NOT have access
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
            );
            const childSpace = resp.body.results;

            const editorAccess = childSpace.access.find(
                (a: SpaceShare) => a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
            );

            expect(editorAccess).toBeUndefined();
        });
    });

    describe('Additive Permissions', () => {
        let admin: Awaited<ReturnType<typeof login>>;
        let rootSpaceUuid: string | undefined;

        beforeAll(async () => {
            admin = await login();
        });

        afterEach(async () => {
            if (rootSpaceUuid) {
                await admin
                    .delete(
                        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}`,
                        { failOnStatusCode: false },
                    )
                    .catch(() => {});
                rootSpaceUuid = undefined;
            }
        });

        it('should allow adding permissions to inheriting space (additive model)', async () => {
            const timestamp = Date.now();

            // Create root (admin only)
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Create inheriting child
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: true,
                },
            );
            const child = childResp.body.results;

            // Add editor directly to child
            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Check child permissions
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
            );
            const childSpace = resp.body.results;

            // Editor should have direct access
            const editorAccess = childSpace.access.find(
                (a: SpaceShare) => a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
            );

            expect(editorAccess).toBeDefined();
            expect(editorAccess?.hasDirectAccess).toBe(true);
            expect(editorAccess?.role).toBe(SpaceMemberRole.EDITOR);

            // Child should still inherit from parent
            expect(childSpace.inheritParentPermissions).toBe(true);
        });

        it('should combine inherited and direct permissions (highest role wins)', async () => {
            const timestamp = Date.now();

            // Create root with editor as VIEWER
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.VIEWER,
                },
            );

            // Create inheriting child, add editor as EDITOR
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: true,
                },
            );
            const child = childResp.body.results;

            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Check child permissions
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
            );
            const childSpace = resp.body.results;

            // Editor should have EDITOR (highest role)
            const editorAccess = childSpace.access.find(
                (a: SpaceShare) => a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
            );

            expect(editorAccess).toBeDefined();
            expect(editorAccess?.role).toBe(SpaceMemberRole.EDITOR);
            // Should show as direct since they have direct access at this level
            expect(editorAccess?.hasDirectAccess).toBe(true);
        });
    });

    describe('Access Control with Different Users', () => {
        let admin: Awaited<ReturnType<typeof login>>;
        let rootSpaceUuid: string | undefined;

        beforeAll(async () => {
            admin = await login();
        });

        afterEach(async () => {
            if (rootSpaceUuid) {
                await admin
                    .delete(
                        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}`,
                        { failOnStatusCode: false },
                    )
                    .catch(() => {});
                rootSpaceUuid = undefined;
            }
        });

        it('user with access to parent should see inheriting child', async () => {
            const timestamp = Date.now();

            // Create root with editor access
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Create inheriting child
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: true,
                },
            );
            const child = childResp.body.results;

            // Login as editor and try to access child
            const editor = await loginAsEditor();
            const resp = await editor.get(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                { failOnStatusCode: false },
            );

            expect(resp.status).toBe(200);
        });

        it('user with access to parent should NOT see unsynced child without direct access', async () => {
            const timestamp = Date.now();

            // Create root with editor access
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Create unsynced child (no inheritance)
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Unsynced Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: false,
                },
            );
            const child = childResp.body.results;

            // Login as editor and try to access child
            const editor = await loginAsEditor();
            const resp = await editor.get(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                { failOnStatusCode: false },
            );

            // Should be forbidden - no direct access to unsynced child
            expect(resp.status).toBe(403);
        });

        it('admin should see all spaces regardless of inheritance settings', async () => {
            const timestamp = Date.now();

            // Create root (private, admin only)
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}`, isPrivate: true },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Create unsynced child (also admin only after break)
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Unsynced Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: false,
                },
            );
            const child = childResp.body.results;

            // Admin should still be able to see the unsynced child
            const resp = await admin.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                { failOnStatusCode: false },
            );

            expect(resp.status).toBe(200);
            expect(resp.body.results.uuid).toBe(child.uuid);
        });
    });

    describe('Breadcrumb Access Information', () => {
        let admin: Awaited<ReturnType<typeof login>>;
        let rootSpaceUuid: string | undefined;

        beforeAll(async () => {
            admin = await login();
        });

        afterEach(async () => {
            if (rootSpaceUuid) {
                await admin
                    .delete(
                        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}`,
                        { failOnStatusCode: false },
                    )
                    .catch(() => {});
                rootSpaceUuid = undefined;
            }
        });

        it('should include breadcrumbs with hasAccess for each ancestor', async () => {
            const timestamp = Date.now();

            // Create hierarchy
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Add editor to root
            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                },
            );
            const child = childResp.body.results;

            const grandchildResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Grandchild ${timestamp}`,
                    parentSpaceUuid: child.uuid,
                },
            );
            const grandchild = grandchildResp.body.results;

            // Get grandchild as editor
            const editor = await loginAsEditor();
            const resp = await editor.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${grandchild.uuid}`,
            );
            const space = resp.body.results;

            expect(space.breadcrumbs).toBeDefined();
            expect(space.breadcrumbs?.length).toBeGreaterThanOrEqual(2);

            // All breadcrumbs should have hasAccess defined
            space.breadcrumbs?.forEach((crumb) => {
                expect(crumb.hasAccess).toBeDefined();
            });
        });

        it('should show hasAccess=false for inaccessible ancestors', async () => {
            const timestamp = Date.now();

            // Create private root (admin only)
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Private Root ${timestamp}`, isPrivate: true },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            // Create child with editor access directly (break inheritance)
            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Accessible Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                    inheritParentPermissions: false,
                },
            );
            const child = childResp.body.results;

            // Add editor to child directly
            await admin.post(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}/share`,
                {
                    userUuid: SEED_ORG_1_EDITOR.user_uuid,
                    spaceRole: SpaceMemberRole.EDITOR,
                },
            );

            // Get child as editor
            const editor = await loginAsEditor();
            const resp = await editor.get<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
            );
            const space = resp.body.results;

            expect(space.breadcrumbs).toBeDefined();

            // Root should be in breadcrumbs but hasAccess=false
            const rootBreadcrumb = space.breadcrumbs?.find(
                (b) => b.uuid === rootSpaceUuid,
            );
            expect(rootBreadcrumb).toBeDefined();
            expect(rootBreadcrumb?.hasAccess).toBe(false);

            // But space name should still be visible
            expect(rootBreadcrumb?.name).toBe(`Private Root ${timestamp}`);
        });
    });

    describe('Delete Impact', () => {
        let admin: Awaited<ReturnType<typeof login>>;
        let rootSpaceUuid: string | undefined;

        beforeAll(async () => {
            admin = await login();
        });

        afterEach(async () => {
            if (rootSpaceUuid) {
                await admin
                    .delete(
                        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}`,
                        { failOnStatusCode: false },
                    )
                    .catch(() => {});
                rootSpaceUuid = undefined;
            }
        });

        it('should show all affected child spaces in delete impact', async () => {
            const timestamp = Date.now();

            // Create hierarchy
            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                },
            );
            const child = childResp.body.results;

            await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Grandchild ${timestamp}`,
                    parentSpaceUuid: child.uuid,
                },
            );

            // Get delete impact for root
            const resp = await admin.get<Body<SpaceDeleteImpact>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}/delete-impact`,
            );

            expect(resp.status).toBe(200);

            const impact = resp.body.results;

            // Should list all affected spaces (root + child + grandchild)
            expect(impact.spaces).toBeDefined();
            expect(impact.spaces.length).toBeGreaterThanOrEqual(3);
        });

        it('should cascade delete to all nested spaces', async () => {
            const timestamp = Date.now();

            const rootResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                { name: `Root ${timestamp}` },
            );
            rootSpaceUuid = rootResp.body.results.uuid;

            const childResp = await admin.post<Body<Space>>(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                {
                    name: `Child ${timestamp}`,
                    parentSpaceUuid: rootSpaceUuid,
                },
            );
            const child = childResp.body.results;

            // Delete root
            await admin.delete(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpaceUuid}`,
            );

            // Child should also be deleted
            const resp = await admin.get(
                `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                { failOnStatusCode: false },
            );
            expect(resp.status).toBe(404);

            // Prevent afterEach from trying to delete again
            rootSpaceUuid = undefined;
        });
    });
});
