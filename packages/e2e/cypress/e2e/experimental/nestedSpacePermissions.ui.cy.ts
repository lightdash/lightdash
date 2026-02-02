/* eslint-disable @typescript-eslint/no-unused-expressions */
/**
 * E2E UI Tests for Nested Space Permission Inheritance
 *
 * These tests validate the UI components and user flows for:
 * - Viewing nested spaces with different permission states
 * - Managing space permissions in the UI
 * - Breaking/restoring inheritance
 * - Breadcrumb navigation with access indicators
 *
 * Prerequisites:
 * - Feature flag `nested-spaces-permissions` must be enabled
 * - Seed data from SPACE_TREE_1 and SPACE_TREE_2 must be present
 */

import { SEED_PROJECT, Space, SpaceSummary } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('Nested Space Permissions - UI Tests', () => {
    describe('Space Visibility by Role', () => {
        describe('Admin user', () => {
            beforeEach(() => {
                cy.login();
            });

            it('should see all root spaces including private ones', () => {
                cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

                // Should see all spaces from SPACE_TREE_1
                cy.contains('Parent Space 1'); // public
                cy.contains('Parent Space 2'); // private, admin has access
                cy.contains('Parent Space 3'); // private with editor access
                cy.contains('Parent Space 5'); // private with group access
            });

            it('should be able to navigate into nested spaces', () => {
                cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

                // Navigate into a nested space hierarchy
                cy.contains('Parent Space 1').click();
                cy.contains('Child Space 1.1').click();
                cy.contains('Grandchild Space 1.1.1');
                cy.contains('Grandchild Space 1.1.2');
            });

            it('should see breadcrumbs when in nested space', () => {
                cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

                // Navigate deep into hierarchy
                cy.contains('Parent Space 1').click();
                cy.contains('Child Space 1.2').click();
                cy.contains('Grandchild Space 1.2.2').click();

                // Should see breadcrumbs
                cy.get('[data-testid="space-breadcrumbs"]').within(() => {
                    cy.contains('Parent Space 1');
                    cy.contains('Child Space 1.2');
                    cy.contains('Grandchild Space 1.2.2');
                });
            });
        });

        describe('Editor user', () => {
            beforeEach(() => {
                cy.loginAsEditor();
            });

            it('should see public spaces and spaces with direct access', () => {
                cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

                // Should see public space
                cy.contains('Parent Space 1');

                // Should see space where editor has access
                cy.contains('Parent Space 3'); // editor has EDITOR access
                cy.contains('Parent Space 4'); // editor created this one

                // Should NOT see private spaces without access
                cy.contains('Parent Space 2').should('not.exist');
            });

            it('should see nested spaces inherited from parent access', () => {
                cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

                // Navigate into a space where editor has access
                cy.contains('Parent Space 3').click();

                // Should see child space (inherits from parent)
                cy.contains('Child Space 3.1');
            });

            it('should see spaces with group access', () => {
                cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

                // Editor is part of SEED_GROUP_2 which has access to Parent Space 5
                cy.contains('Parent Space 5');

                cy.contains('Parent Space 5').click();
                cy.contains('Child Space 5.1');
            });
        });

        describe('Viewer user', () => {
            beforeEach(() => {
                cy.loginAsViewer();
            });

            it('should only see public spaces', () => {
                cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

                // Should see public space
                cy.contains('Parent Space 1');

                // Should NOT see private spaces
                cy.contains('Parent Space 2').should('not.exist');
                cy.contains('Parent Space 3').should('not.exist');
                cy.contains('Parent Space 4').should('not.exist');
            });

            it('should see nested spaces under public parent', () => {
                cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

                cy.contains('Parent Space 1').click();

                // Should see all nested spaces under public parent
                cy.contains('Child Space 1.1');
                cy.contains('Child Space 1.2');
                cy.contains('Child Space 1.3');
            });
        });
    });

    describe('Space Creation with Inheritance', () => {
        beforeEach(() => {
            cy.login();
        });

        afterEach(() => {
            // Clean up created spaces
            cy.login();
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            }).then((resp) => {
                const testSpaces = (resp.body.results as SpaceSummary[]).filter(
                    (s) => s.name.startsWith('E2E Test Space'),
                );

                cy.wrap(testSpaces).each((space: SpaceSummary) => {
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${space.uuid}`,
                        method: 'DELETE',
                        failOnStatusCode: false,
                    });
                });
            });
        });

        it('should create nested space from parent space page', () => {
            const spaceName = `E2E Test Space ${Date.now()}`;

            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

            // Navigate into a parent space
            cy.contains('Parent Space 1').click();

            // Create new nested space
            cy.get('[data-testid="Space/AddButton"]').click();
            cy.contains('Create space').click();

            cy.findByPlaceholderText('eg. KPIs').type(spaceName);
            cy.get('button').contains('Create').click();

            // Should show the new space
            cy.contains(spaceName);

            // Verify it's nested under Parent Space 1
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            }).then((resp) => {
                const newSpace = (resp.body.results as Space[]).find(
                    (s) => s.name === spaceName,
                );
                expect(newSpace).to.not.be.undefined;
                expect(newSpace?.parentSpaceUuid).to.not.be.null;
            });
        });
    });

    describe('Space Settings Panel', () => {
        let testSpaceUuid: string;

        beforeEach(() => {
            cy.login();

            // Create a test space hierarchy
            const timestamp = Date.now();
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `E2E Parent ${timestamp}` },
            }).then((parentResp) => {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `E2E Child ${timestamp}`,
                        parentSpaceUuid: (parentResp.body.results as Space)
                            .uuid,
                    },
                }).then((childResp) => {
                    testSpaceUuid = (childResp.body.results as Space).uuid;
                });
            });
        });

        afterEach(() => {
            cy.login();
            // Clean up - delete parent will cascade
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            }).then((resp) => {
                const testSpaces = (resp.body.results as SpaceSummary[]).filter(
                    (s) => s.name.startsWith('E2E') && !s.parentSpaceUuid, // Only root spaces
                );
                cy.wrap(testSpaces).each((space: SpaceSummary) => {
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${space.uuid}`,
                        method: 'DELETE',
                        failOnStatusCode: false,
                    });
                });
            });
        });

        it('should show inheritance toggle for nested spaces', () => {
            // Navigate to nested space settings
            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/spaces/${testSpaceUuid}`,
            );

            // Open space settings
            cy.get('[data-testid="space-settings-button"]').click();

            // Should show inheritance toggle
            cy.contains('Inherit permissions from parent');
            cy.get('[data-testid="inherit-permissions-toggle"]').should(
                'exist',
            );
        });

        it('should display effective permissions list', () => {
            cy.visit(
                `/projects/${SEED_PROJECT.project_uuid}/spaces/${testSpaceUuid}`,
            );

            cy.get('[data-testid="space-settings-button"]').click();

            // Should show permissions section
            cy.contains('Access');

            // Should show the admin user in permissions
            cy.contains('demo@lightdash.com');
        });
    });

    describe('Breadcrumb Navigation', () => {
        beforeEach(() => {
            cy.login();
        });

        it('should navigate to parent via breadcrumb click', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

            // Navigate deep
            cy.contains('Parent Space 1').click();
            cy.contains('Child Space 1.2').click();
            cy.contains('Grandchild Space 1.2.2').click();

            // Click parent breadcrumb
            cy.get('[data-testid="space-breadcrumbs"]').within(() => {
                cy.contains('Child Space 1.2').click();
            });

            // Should be back at child level
            cy.contains('Grandchild Space 1.2.1');
            cy.contains('Grandchild Space 1.2.2');
        });

        it('should show breadcrumbs for spaces with limited access', () => {
            // This test validates that breadcrumbs show parent names
            // even when user might not have full access to parent

            cy.loginAsEditor();
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

            // Navigate into space where editor has access
            cy.contains('Parent Space 3').click();
            cy.contains('Child Space 3.1').click();

            // Breadcrumbs should show full path
            cy.get('[data-testid="space-breadcrumbs"]').within(() => {
                cy.contains('Parent Space 3');
                cy.contains('Child Space 3.1');
            });
        });
    });

    describe('Space Tree in Modals', () => {
        beforeEach(() => {
            cy.login();
        });

        it('should show nested spaces in dashboard create modal', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);

            cy.contains('New').click();
            cy.contains('Arrange multiple charts into a single view.').click();

            cy.findByPlaceholderText('eg. KPI Dashboard').type(
                `Test Dashboard ${Date.now()}`,
            );

            cy.get('[data-testid="DashboardCreateModal/Next"]').click();

            // Should show root spaces
            cy.contains('Parent Space 1');

            // Click to expand and see nested spaces
            cy.contains('Parent Space 1').click();
            cy.contains('Child Space 1.1');
        });

        it('should respect permissions in space tree', () => {
            cy.loginAsEditor();
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);

            cy.contains('New').click();
            cy.contains('Arrange multiple charts into a single view.').click();

            cy.findByPlaceholderText('eg. KPI Dashboard').type(
                `Test Dashboard ${Date.now()}`,
            );

            cy.get('[data-testid="DashboardCreateModal/Next"]').click();

            // Editor should see spaces they have access to
            cy.contains('Parent Space 3');
            cy.contains('Parent Space 4');

            // Should NOT see private spaces without access
            cy.contains('Parent Space 2').should('not.exist');
        });
    });

    describe('Delete Space Flow', () => {
        let parentSpaceUuid: string;

        beforeEach(() => {
            cy.login();

            // Create test hierarchy
            const timestamp = Date.now();
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: `E2E Delete Parent ${timestamp}` },
            }).then((parentResp) => {
                parentSpaceUuid = (parentResp.body.results as Space).uuid;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: `E2E Delete Child ${timestamp}`,
                        parentSpaceUuid,
                    },
                });
            });
        });

        afterEach(() => {
            cy.login();
            if (parentSpaceUuid) {
                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${parentSpaceUuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                });
            }
        });

        it('should show delete impact with affected child spaces', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

            // Find and open menu for parent space
            cy.contains('E2E Delete Parent')
                .parents('[data-testid^="ResourceViewItem"]')
                .find('[data-testid^="ResourceViewActionMenu"]')
                .click();

            cy.contains('Delete space').click();

            // Delete confirmation should show impact
            cy.contains('This will also delete');
            cy.contains('E2E Delete Child');
        });

        it('should cascade delete nested spaces', () => {
            const timestamp = Date.now();
            const parentName = `E2E Delete Parent ${timestamp}`;
            const childName = `E2E Delete Child ${timestamp}`;

            // Create fresh hierarchy for this test
            cy.request({
                url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                method: 'POST',
                body: { name: parentName },
            }).then((parentResp) => {
                const newParentUuid = (parentResp.body.results as Space).uuid;
                parentSpaceUuid = newParentUuid;

                cy.request({
                    url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
                    method: 'POST',
                    body: {
                        name: childName,
                        parentSpaceUuid: newParentUuid,
                    },
                }).then((childResp) => {
                    const childUuid = (childResp.body.results as Space).uuid;

                    // Delete via UI
                    cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

                    cy.get(
                        `[data-testid="ResourceViewActionMenu/${parentName}"]`,
                    ).click();
                    cy.contains('Delete space').click();

                    // Confirm deletion
                    cy.findByPlaceholderText('Space name').type(parentName);
                    cy.get('button').contains('Delete').click();

                    // Verify both are deleted
                    cy.request({
                        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${childUuid}`,
                        failOnStatusCode: false,
                    }).then((resp) => {
                        expect(resp.status).to.eq(404);
                    });

                    // Clear the uuid since it's deleted
                    parentSpaceUuid = '';
                });
            });
        });
    });

    describe('Permission-Based Actions', () => {
        beforeEach(() => {
            cy.login();
        });

        it('admin can manage all spaces', () => {
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

            // Should be able to open actions on any space
            cy.contains('Parent Space 1')
                .parents('[data-testid^="ResourceViewItem"]')
                .find('[data-testid^="ResourceViewActionMenu"]')
                .click();

            // Should see management options
            cy.contains('Edit');
            cy.contains('Delete space');
        });

        it('editor can manage spaces with appropriate access', () => {
            cy.loginAsEditor();
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

            // Navigate to a space editor owns
            cy.contains('Parent Space 4').click();

            // Should be able to manage their own space
            cy.get('[data-testid^="ResourceViewActionMenu"]').first().click();
            cy.contains('Edit');
        });

        it('viewer cannot manage spaces', () => {
            cy.loginAsViewer();
            cy.visit(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

            // Navigate to public space
            cy.contains('Parent Space 1').click();

            // Should not see management options or they should be disabled
            cy.get('[data-testid="Space/AddButton"]').should('not.exist');
        });
    });
});
