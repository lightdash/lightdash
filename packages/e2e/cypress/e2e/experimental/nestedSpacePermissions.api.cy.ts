/* eslint-disable @typescript-eslint/no-unused-expressions */
/**
 * E2E Tests for Nested Space Permission Inheritance
 *
 * These tests validate the nested space permissions feature where:
 * - Nested spaces inherit permissions from parent by default
 * - Permissions are additive through the ancestry chain
 * - Spaces can break inheritance to define explicit permissions
 * - The highest role wins when a user appears multiple times in chain
 *
 * Prerequisites:
 * - Feature flag `nested-spaces-permissions` must be enabled
 * - Seed data from SPACE_TREE_1 and SPACE_TREE_2 must be present
 */

import {
    SEED_ORG_1_EDITOR,
    SEED_PROJECT,
    Space,
    SpaceMemberRole,
    SpaceShare,
} from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Nested Space Permission Inheritance - API Tests', () => {
    describe('Default Inheritance Behavior', () => {
        let parentSpace: Space;

        beforeEach(() => {
            cy.login();
        });

        afterEach(() => {
            cy.login();
            if (parentSpace?.uuid) {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${parentSpace.uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });

        it('should create nested space with inheritParentPermissions=true by default', () => {
            const timestamp = Date.now();

            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Test Parent ${timestamp}` },
            }).then((parentResp) => {
                parentSpace = parentResp.body.results;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `Test Child ${timestamp}`,
                        parentSpaceUuid: parentSpace.uuid,
                    },
                }).then((childResp) => {
                    const child = childResp.body.results;
                    expect(child.inheritParentPermissions).to.eq(true);
                    expect(child.parentSpaceUuid).to.eq(parentSpace.uuid);
                });
            });
        });

        it('should create nested space with explicit inheritParentPermissions=false', () => {
            const timestamp = Date.now();

            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Test Parent ${timestamp}` },
            }).then((parentResp) => {
                parentSpace = parentResp.body.results;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `Test Child ${timestamp}`,
                        parentSpaceUuid: parentSpace.uuid,
                        inheritParentPermissions: false,
                    },
                }).then((childResp) => {
                    const child = childResp.body.results;
                    expect(child.inheritParentPermissions).to.eq(false);
                    expect(child.parentSpaceUuid).to.eq(parentSpace.uuid);
                });
            });
        });
    });

    describe('Permission Inheritance Chain', () => {
        let rootSpace: Space;

        beforeEach(() => {
            cy.login();
        });

        afterEach(() => {
            cy.login();
            if (rootSpace?.uuid) {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });

        it('should inherit permissions from parent space', () => {
            const timestamp = Date.now();

            // Create root space
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                // Add editor user to root space
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}/share`,
                    method: 'POST',
                    body: {
                        userUuid: SEED_ORG_1_EDITOR.user_uuid,
                        spaceRole: SpaceMemberRole.EDITOR,
                    },
                }).then(() => {
                    // Create child that inherits
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                        method: 'POST',
                        body: {
                            name: `Child ${timestamp}`,
                            parentSpaceUuid: rootSpace.uuid,
                            inheritParentPermissions: true,
                        },
                    }).then((childResp) => {
                        const child = childResp.body.results as Space;

                        // Get child space details
                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                        }).then((resp) => {
                            const childWithAccess = resp.body.results as Space;

                            // Child should have editor's access via inheritance
                            const editorAccess = childWithAccess.access.find(
                                (a: SpaceShare) =>
                                    a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
                            );

                            expect(editorAccess).to.not.be.undefined;
                            expect(editorAccess?.role).to.eq(
                                SpaceMemberRole.EDITOR,
                            );
                            // Inherited access should have hasDirectAccess=false
                            expect(editorAccess?.hasDirectAccess).to.eq(false);
                        });
                    });
                });
            });
        });

        it('should aggregate permissions through multiple levels of nesting', () => {
            const timestamp = Date.now();

            // Create a 3-level hierarchy
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                // Add editor to root as VIEWER
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}/share`,
                    method: 'POST',
                    body: {
                        userUuid: SEED_ORG_1_EDITOR.user_uuid,
                        spaceRole: SpaceMemberRole.VIEWER,
                    },
                }).then(() => {
                    // Create child
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                        method: 'POST',
                        body: {
                            name: `Child ${timestamp}`,
                            parentSpaceUuid: rootSpace.uuid,
                        },
                    }).then((childResp) => {
                        const child = childResp.body.results as Space;

                        // Upgrade editor to EDITOR on child
                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}/share`,
                            method: 'POST',
                            body: {
                                userUuid: SEED_ORG_1_EDITOR.user_uuid,
                                spaceRole: SpaceMemberRole.EDITOR,
                            },
                        }).then(() => {
                            // Create grandchild
                            cy.request({
                                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                                method: 'POST',
                                body: {
                                    name: `Grandchild ${timestamp}`,
                                    parentSpaceUuid: child.uuid,
                                },
                            }).then((grandchildResp) => {
                                const grandchild = grandchildResp.body
                                    .results as Space;

                                // Check grandchild permissions
                                cy.request({
                                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${grandchild.uuid}`,
                                }).then((resp) => {
                                    const gcWithAccess = resp.body
                                        .results as Space;

                                    // Editor should have EDITOR (highest role from chain)
                                    const editorAccess =
                                        gcWithAccess.access.find(
                                            (a: SpaceShare) =>
                                                a.userUuid ===
                                                SEED_ORG_1_EDITOR.user_uuid,
                                        );

                                    expect(editorAccess).to.not.be.undefined;
                                    expect(editorAccess?.role).to.eq(
                                        SpaceMemberRole.EDITOR,
                                    );
                                });
                            });
                        });
                    });
                });
            });
        });
    });

    describe('Breaking Inheritance', () => {
        let rootSpace: Space;

        beforeEach(() => {
            cy.login();
        });

        afterEach(() => {
            cy.login();
            if (rootSpace?.uuid) {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });

        it('should copy permissions when setting inheritParentPermissions=false', () => {
            // This test validates that when breaking inheritance, all effective
            // permissions are copied as direct permissions to the space.
            // This ensures users don't lose access when switching to explicit permissions.
            // Requires: Feature flag `nested-spaces-permissions` must be ON
            const timestamp = Date.now();

            // Create root with editor access
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}/share`,
                    method: 'POST',
                    body: {
                        userUuid: SEED_ORG_1_EDITOR.user_uuid,
                        spaceRole: SpaceMemberRole.EDITOR,
                    },
                }).then(() => {
                    // Create inheriting child
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                        method: 'POST',
                        body: {
                            name: `Child ${timestamp}`,
                            parentSpaceUuid: rootSpace.uuid,
                            inheritParentPermissions: true,
                        },
                    }).then((childResp) => {
                        const child = childResp.body.results as Space;

                        // Break inheritance
                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                            method: 'PATCH',
                            body: {
                                name: child.name,
                                inheritParentPermissions: false,
                            },
                        }).then((updateResp) => {
                            const updatedChild = updateResp.body
                                .results as Space;
                            expect(updatedChild.inheritParentPermissions).to.eq(
                                false,
                            );

                            // Editor should now have direct access (copied from inheritance)
                            const editorAccess = updatedChild.access.find(
                                (a: SpaceShare) =>
                                    a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
                            );

                            // POC STATUS: If this fails, the permission copy on inheritance break
                            // may not be implemented yet. Check SpaceService.updateSpace()
                            expect(
                                editorAccess,
                                'Editor should have access after breaking inheritance (permissions should be copied)',
                            ).to.not.be.undefined;
                            // After breaking, access should be direct
                            expect(editorAccess?.hasDirectAccess).to.eq(true);
                        });
                    });
                });
            });
        });

        it('should not inherit new parent permissions after breaking inheritance', () => {
            const timestamp = Date.now();

            // Create root
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                // Create child and break inheritance
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `Child ${timestamp}`,
                        parentSpaceUuid: rootSpace.uuid,
                        inheritParentPermissions: true,
                    },
                }).then((childResp) => {
                    const child = childResp.body.results as Space;

                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                        method: 'PATCH',
                        body: {
                            name: child.name,
                            inheritParentPermissions: false,
                        },
                    }).then(() => {
                        // Now add editor to root AFTER breaking inheritance
                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}/share`,
                            method: 'POST',
                            body: {
                                userUuid: SEED_ORG_1_EDITOR.user_uuid,
                                spaceRole: SpaceMemberRole.EDITOR,
                            },
                        }).then(() => {
                            // Check child - editor should NOT have access
                            cy.request({
                                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                            }).then((resp) => {
                                const childSpace = resp.body.results as Space;

                                // Editor should NOT have access to unsynced child
                                const editorAccess = childSpace.access.find(
                                    (a: SpaceShare) =>
                                        a.userUuid ===
                                        SEED_ORG_1_EDITOR.user_uuid,
                                );

                                expect(editorAccess).to.be.undefined;
                            });
                        });
                    });
                });
            });
        });
    });

    describe('Additive Permissions', () => {
        let rootSpace: Space;

        beforeEach(() => {
            cy.login();
        });

        afterEach(() => {
            cy.login();
            if (rootSpace?.uuid) {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });

        it('should allow adding permissions to inheriting space (additive model)', () => {
            const timestamp = Date.now();

            // Create root (admin only)
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                // Create inheriting child
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `Child ${timestamp}`,
                        parentSpaceUuid: rootSpace.uuid,
                        inheritParentPermissions: true,
                    },
                }).then((childResp) => {
                    const child = childResp.body.results as Space;

                    // Add editor directly to child
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}/share`,
                        method: 'POST',
                        body: {
                            userUuid: SEED_ORG_1_EDITOR.user_uuid,
                            spaceRole: SpaceMemberRole.EDITOR,
                        },
                    }).then(() => {
                        // Check child permissions
                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                        }).then((resp) => {
                            const childSpace = resp.body.results as Space;

                            // Editor should have direct access
                            const editorAccess = childSpace.access.find(
                                (a: SpaceShare) =>
                                    a.userUuid === SEED_ORG_1_EDITOR.user_uuid,
                            );

                            expect(editorAccess).to.not.be.undefined;
                            expect(editorAccess?.hasDirectAccess).to.eq(true);
                            expect(editorAccess?.role).to.eq(
                                SpaceMemberRole.EDITOR,
                            );

                            // Child should still inherit from parent
                            expect(childSpace.inheritParentPermissions).to.eq(
                                true,
                            );
                        });
                    });
                });
            });
        });

        it('should combine inherited and direct permissions (highest role wins)', () => {
            const timestamp = Date.now();

            // Create root with editor as VIEWER
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}/share`,
                    method: 'POST',
                    body: {
                        userUuid: SEED_ORG_1_EDITOR.user_uuid,
                        spaceRole: SpaceMemberRole.VIEWER,
                    },
                }).then(() => {
                    // Create inheriting child, add editor as EDITOR
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                        method: 'POST',
                        body: {
                            name: `Child ${timestamp}`,
                            parentSpaceUuid: rootSpace.uuid,
                            inheritParentPermissions: true,
                        },
                    }).then((childResp) => {
                        const child = childResp.body.results as Space;

                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}/share`,
                            method: 'POST',
                            body: {
                                userUuid: SEED_ORG_1_EDITOR.user_uuid,
                                spaceRole: SpaceMemberRole.EDITOR,
                            },
                        }).then(() => {
                            // Check child permissions
                            cy.request({
                                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                            }).then((resp) => {
                                const childSpace = resp.body.results as Space;

                                // Editor should have EDITOR (highest role)
                                const editorAccess = childSpace.access.find(
                                    (a: SpaceShare) =>
                                        a.userUuid ===
                                        SEED_ORG_1_EDITOR.user_uuid,
                                );

                                expect(editorAccess).to.not.be.undefined;
                                expect(editorAccess?.role).to.eq(
                                    SpaceMemberRole.EDITOR,
                                );
                                // Should show as direct since they have direct access at this level
                                expect(editorAccess?.hasDirectAccess).to.eq(
                                    true,
                                );
                            });
                        });
                    });
                });
            });
        });
    });

    describe('Access Control with Different Users', () => {
        let rootSpace: Space;

        beforeEach(() => {
            cy.login();
        });

        afterEach(() => {
            cy.login();
            if (rootSpace?.uuid) {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });

        it('user with access to parent should see inheriting child', () => {
            const timestamp = Date.now();

            // Create root with editor access
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}/share`,
                    method: 'POST',
                    body: {
                        userUuid: SEED_ORG_1_EDITOR.user_uuid,
                        spaceRole: SpaceMemberRole.EDITOR,
                    },
                }).then(() => {
                    // Create inheriting child
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                        method: 'POST',
                        body: {
                            name: `Child ${timestamp}`,
                            parentSpaceUuid: rootSpace.uuid,
                            inheritParentPermissions: true,
                        },
                    }).then((childResp) => {
                        const child = childResp.body.results as Space;

                        // Login as editor and try to access child
                        cy.loginAsEditor();

                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                            failOnStatusCode: false,
                        }).then((resp) => {
                            expect(resp.status).to.eq(200);
                            expect(resp.body.results.uuid).to.eq(child.uuid);
                        });
                    });
                });
            });
        });

        it('user with access to parent should NOT see unsynced child without direct access', () => {
            const timestamp = Date.now();

            // Create root with editor access
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}/share`,
                    method: 'POST',
                    body: {
                        userUuid: SEED_ORG_1_EDITOR.user_uuid,
                        spaceRole: SpaceMemberRole.EDITOR,
                    },
                }).then(() => {
                    // Create unsynced child (no inheritance)
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                        method: 'POST',
                        body: {
                            name: `Unsynced Child ${timestamp}`,
                            parentSpaceUuid: rootSpace.uuid,
                            inheritParentPermissions: false,
                        },
                    }).then((childResp) => {
                        const child = childResp.body.results as Space;

                        // Login as editor and try to access child
                        cy.loginAsEditor();

                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                            failOnStatusCode: false,
                        }).then((resp) => {
                            // Should be forbidden - no direct access to unsynced child
                            expect(resp.status).to.eq(403);
                        });
                    });
                });
            });
        });

        it('admin should see all spaces regardless of inheritance settings', () => {
            const timestamp = Date.now();

            // Create root (private, admin only)
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}`, isPrivate: true },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                // Create unsynced child (also admin only after break)
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `Unsynced Child ${timestamp}`,
                        parentSpaceUuid: rootSpace.uuid,
                        inheritParentPermissions: false,
                    },
                }).then((childResp) => {
                    const child = childResp.body.results as Space;

                    // Admin should still be able to see the unsynced child
                    cy.login(); // Login as admin

                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                        failOnStatusCode: false,
                    }).then((resp) => {
                        expect(resp.status).to.eq(200);
                        expect(resp.body.results.uuid).to.eq(child.uuid);
                    });
                });
            });
        });
    });

    describe('Breadcrumb Access Information', () => {
        let rootSpace: Space;

        beforeEach(() => {
            cy.login();
        });

        afterEach(() => {
            cy.login();
            if (rootSpace?.uuid) {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });

        it('should include breadcrumbs with hasAccess for each ancestor', () => {
            const timestamp = Date.now();

            // Create hierarchy
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                // Add editor to root
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}/share`,
                    method: 'POST',
                    body: {
                        userUuid: SEED_ORG_1_EDITOR.user_uuid,
                        spaceRole: SpaceMemberRole.EDITOR,
                    },
                }).then(() => {
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                        method: 'POST',
                        body: {
                            name: `Child ${timestamp}`,
                            parentSpaceUuid: rootSpace.uuid,
                        },
                    }).then((childResp) => {
                        const child = childResp.body.results as Space;

                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                            method: 'POST',
                            body: {
                                name: `Grandchild ${timestamp}`,
                                parentSpaceUuid: child.uuid,
                            },
                        }).then((grandchildResp) => {
                            const grandchild = grandchildResp.body
                                .results as Space;

                            // Get grandchild as editor
                            cy.loginAsEditor();

                            cy.request({
                                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${grandchild.uuid}`,
                            }).then((resp) => {
                                const space = resp.body.results as Space;

                                expect(space.breadcrumbs).to.not.be.undefined;
                                expect(space.breadcrumbs?.length).to.be.gte(2);

                                // All breadcrumbs should have hasAccess defined
                                space.breadcrumbs?.forEach((crumb) => {
                                    expect(crumb.hasAccess).to.not.be.undefined;
                                });
                            });
                        });
                    });
                });
            });
        });

        it('should show hasAccess=false for inaccessible ancestors', () => {
            const timestamp = Date.now();

            // Create private root (admin only)
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Private Root ${timestamp}`, isPrivate: true },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                // Create child with editor access directly (break inheritance)
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `Accessible Child ${timestamp}`,
                        parentSpaceUuid: rootSpace.uuid,
                        inheritParentPermissions: false,
                    },
                }).then((childResp) => {
                    const child = childResp.body.results as Space;

                    // Add editor to child directly
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}/share`,
                        method: 'POST',
                        body: {
                            userUuid: SEED_ORG_1_EDITOR.user_uuid,
                            spaceRole: SpaceMemberRole.EDITOR,
                        },
                    }).then(() => {
                        // Get child as editor
                        cy.loginAsEditor();

                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                        }).then((resp) => {
                            const space = resp.body.results as Space;

                            expect(space.breadcrumbs).to.not.be.undefined;

                            // Root should be in breadcrumbs but hasAccess=false
                            const rootBreadcrumb = space.breadcrumbs?.find(
                                (b) => b.uuid === rootSpace.uuid,
                            );
                            expect(rootBreadcrumb).to.not.be.undefined;
                            expect(rootBreadcrumb?.hasAccess).to.eq(false);

                            // But space name should still be visible
                            expect(rootBreadcrumb?.name).to.eq(
                                `Private Root ${timestamp}`,
                            );
                        });
                    });
                });
            });
        });
    });

    describe('Delete Impact', () => {
        let rootSpace: Space | undefined;

        beforeEach(() => {
            cy.login();
        });

        afterEach(() => {
            cy.login();
            // Root may already be deleted in test
            if (rootSpace?.uuid) {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace.uuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });

        it('should show all affected child spaces in delete impact', () => {
            const timestamp = Date.now();

            // Create hierarchy
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `Child ${timestamp}`,
                        parentSpaceUuid: rootSpace?.uuid,
                    },
                }).then((childResp) => {
                    const child = childResp.body.results as Space;

                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                        method: 'POST',
                        body: {
                            name: `Grandchild ${timestamp}`,
                            parentSpaceUuid: child.uuid,
                        },
                    }).then(() => {
                        // Get delete impact for root
                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace!.uuid}/delete-impact`,
                        }).then((resp) => {
                            expect(resp.status).to.eq(200);

                            const impact = resp.body.results;

                            // Should list affected child spaces (API uses 'childSpaces' property)
                            expect(impact.childSpaces).to.not.be.undefined;
                            expect(impact.childSpaces.length).to.be.gte(2); // Child and grandchild
                        });
                    });
                });
            });
        });

        it('should cascade delete to all nested spaces', () => {
            const timestamp = Date.now();

            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `Root ${timestamp}` },
            }).then((rootResp) => {
                rootSpace = rootResp.body.results;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `Child ${timestamp}`,
                        parentSpaceUuid: rootSpace?.uuid,
                    },
                }).then((childResp) => {
                    const child = childResp.body.results as Space;

                    // Delete root
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${rootSpace!.uuid}`,
                        method: 'DELETE',
                    }).then(() => {
                        // Child should also be deleted
                        cy.request({
                            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${child.uuid}`,
                            failOnStatusCode: false,
                        }).then((resp) => {
                            expect(resp.status).to.eq(404);
                        });
                    });
                });
            });
        });
    });
});
