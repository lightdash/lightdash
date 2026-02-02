/* eslint-disable @typescript-eslint/no-unused-expressions */
/**
 * Cypress helper functions for space-related operations
 * Used by nested space permission E2E tests
 */

import {
    SEED_PROJECT,
    Space,
    SpaceDeleteImpact,
    SpaceMemberRole,
    SpaceShare,
    SpaceSummary,
} from '@lightdash/common';

const apiUrl = '/api/v1';

export interface CreateSpaceOptions {
    name: string;
    projectUuid?: string;
    parentSpaceUuid?: string;
    isPrivate?: boolean;
    inheritParentPermissions?: boolean;
}

export interface UpdateSpaceOptions {
    name?: string;
    inheritParentPermissions?: boolean;
}

/**
 * Create a new space
 */
export const createSpace = (
    opts: CreateSpaceOptions,
): Cypress.Chainable<Space> => {
    const projectUuid = opts.projectUuid ?? SEED_PROJECT.project_uuid;

    return cy
        .request({
            url: `${apiUrl}/projects/${projectUuid}/spaces`,
            method: 'POST',
            headers: { 'Content-type': 'application/json' },
            body: {
                name: opts.name,
                isPrivate: opts.isPrivate ?? true,
                parentSpaceUuid: opts.parentSpaceUuid,
                inheritParentPermissions: opts.inheritParentPermissions,
            },
        })
        .then((resp) => {
            expect(resp.status).to.eq(200);
            return resp.body.results as Space;
        });
};

/**
 * Get a space by UUID with full details
 */
export const getSpace = (
    spaceUuid: string,
    projectUuid?: string,
): Cypress.Chainable<Space> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    return cy
        .request({
            url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}`,
        })
        .then((resp) => {
            expect(resp.status).to.eq(200);
            return resp.body.results as Space;
        });
};

/**
 * Get a space by name (searches all spaces)
 */
export const getSpaceByName = (
    name: string,
    projectUuid?: string,
): Cypress.Chainable<Space> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    return cy
        .request({
            url: `${apiUrl}/projects/${pUuid}/spaces`,
        })
        .then((resp) => {
            expect(resp.status).to.eq(200);
            const space = (resp.body.results as SpaceSummary[]).find(
                (s) => s.name === name,
            );
            if (!space) {
                throw new Error(`Space "${name}" not found`);
            }
            return getSpace(space.uuid, pUuid);
        });
};

/**
 * Update a space
 */
export const updateSpace = (
    spaceUuid: string,
    updates: UpdateSpaceOptions,
    projectUuid?: string,
): Cypress.Chainable<Space> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    return cy
        .request({
            url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}`,
            method: 'PATCH',
            headers: { 'Content-type': 'application/json' },
            body: updates,
        })
        .then((resp) => {
            expect(resp.status).to.eq(200);
            return resp.body.results as Space;
        });
};

/**
 * Delete a space
 */
export const deleteSpace = (
    spaceUuid: string,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    cy.request({
        url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}`,
        method: 'DELETE',
    }).then((resp) => {
        expect(resp.status).to.eq(200);
    });

    return cy.wrap(undefined);
};

/**
 * Delete a space silently (no error on failure)
 */
export const deleteSpaceSilent = (
    spaceUuid: string,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    cy.request({
        url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}`,
        method: 'DELETE',
        failOnStatusCode: false,
    });

    return cy.wrap(undefined);
};

/**
 * Add user access to a space
 */
export const addSpaceUserAccess = (
    spaceUuid: string,
    userUuid: string,
    spaceRole: SpaceMemberRole,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    cy.request({
        url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}/share`,
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: { userUuid, spaceRole },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
    });

    return cy.wrap(undefined);
};

/**
 * Remove user access from a space
 */
export const removeSpaceUserAccess = (
    spaceUuid: string,
    userUuid: string,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    cy.request({
        url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}/share/${userUuid}`,
        method: 'DELETE',
    }).then((resp) => {
        expect(resp.status).to.eq(200);
    });

    return cy.wrap(undefined);
};

/**
 * Add group access to a space
 */
export const addSpaceGroupAccess = (
    spaceUuid: string,
    groupUuid: string,
    spaceRole: SpaceMemberRole,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    cy.request({
        url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}/group/share`,
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: { groupUuid, spaceRole },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
    });

    return cy.wrap(undefined);
};

/**
 * Remove group access from a space
 */
export const removeSpaceGroupAccess = (
    spaceUuid: string,
    groupUuid: string,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    cy.request({
        url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}/group/share/${groupUuid}`,
        method: 'DELETE',
    }).then((resp) => {
        expect(resp.status).to.eq(200);
    });

    return cy.wrap(undefined);
};

/**
 * Get delete impact for a space
 */
export const getDeleteImpact = (
    spaceUuid: string,
    projectUuid?: string,
): Cypress.Chainable<SpaceDeleteImpact> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    return cy
        .request({
            url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}/delete-impact`,
        })
        .then((resp) => {
            expect(resp.status).to.eq(200);
            return resp.body.results as SpaceDeleteImpact;
        });
};

/**
 * Verify user has access to a space
 */
export const verifyUserHasAccess = (
    spaceUuid: string,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    cy.request({
        url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}`,
        failOnStatusCode: false,
    }).then((resp) => {
        expect(resp.status).to.eq(200);
    });

    return cy.wrap(undefined);
};

/**
 * Verify user does NOT have access to a space
 */
export const verifyUserHasNoAccess = (
    spaceUuid: string,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    cy.request({
        url: `${apiUrl}/projects/${pUuid}/spaces/${spaceUuid}`,
        failOnStatusCode: false,
    }).then((resp) => {
        expect(resp.status).to.eq(403);
    });

    return cy.wrap(undefined);
};

/**
 * Verify effective permissions on a space
 */
export const verifyEffectivePermissions = (
    spaceUuid: string,
    expectedPermissions: Array<{
        userUuid: string;
        role: SpaceMemberRole;
        hasDirectAccess: boolean;
    }>,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    getSpace(spaceUuid, projectUuid).then((space) => {
        cy.wrap(expectedPermissions).each(
            (expected: {
                userUuid: string;
                role: SpaceMemberRole;
                hasDirectAccess: boolean;
            }) => {
                const actual = space.access.find(
                    (a: SpaceShare) => a.userUuid === expected.userUuid,
                );

                expect(actual, `User ${expected.userUuid} should have access`)
                    .to.not.be.undefined;
                expect(actual?.role).to.eq(expected.role);
                expect(actual?.hasDirectAccess).to.eq(expected.hasDirectAccess);
            },
        );
    });

    return cy.wrap(undefined);
};

/**
 * Create a space hierarchy for testing
 * Returns UUIDs of created spaces: { root, children: [...] }
 */
export const createSpaceHierarchy = (
    rootName: string,
    childNames: string[],
    options?: {
        projectUuid?: string;
        isPrivate?: boolean;
        childInheritance?: boolean;
    },
): Cypress.Chainable<{ root: string; children: string[] }> => {
    const pUuid = options?.projectUuid ?? SEED_PROJECT.project_uuid;

    return createSpace({
        name: rootName,
        projectUuid: pUuid,
        isPrivate: options?.isPrivate ?? true,
    }).then((root) => {
        const childPromises = childNames.map((name) =>
            createSpace({
                name,
                projectUuid: pUuid,
                parentSpaceUuid: root.uuid,
                inheritParentPermissions: options?.childInheritance ?? true,
            }),
        );

        return cy
            .wrap(Promise.all(childPromises))
            .then((children: Space[]) => ({
                root: root.uuid,
                children: children.map((c: Space) => c.uuid),
            }));
    });
};

/**
 * Toggle inheritance on a space
 */
export const toggleInheritance = (
    spaceUuid: string,
    inherit: boolean,
    projectUuid?: string,
): Cypress.Chainable<Space> =>
    getSpace(spaceUuid, projectUuid).then((space) =>
        updateSpace(
            spaceUuid,
            {
                name: space.name,
                inheritParentPermissions: inherit,
            },
            projectUuid,
        ),
    );

/**
 * Clean up test spaces by name prefix
 */
export const cleanupSpacesByPrefix = (
    prefix: string,
    projectUuid?: string,
): Cypress.Chainable<void> => {
    const pUuid = projectUuid ?? SEED_PROJECT.project_uuid;

    cy.request({
        url: `${apiUrl}/projects/${pUuid}/spaces`,
    }).then((resp) => {
        const testSpaces = (resp.body.results as SpaceSummary[]).filter(
            (s) => s.name.startsWith(prefix) && !s.parentSpaceUuid, // Only root spaces
        );

        cy.wrap(testSpaces).each((space: SpaceSummary) => {
            cy.request({
                url: `${apiUrl}/projects/${pUuid}/spaces/${space.uuid}`,
                method: 'DELETE',
                failOnStatusCode: false,
            });
        });
    });

    return cy.wrap(undefined);
};
