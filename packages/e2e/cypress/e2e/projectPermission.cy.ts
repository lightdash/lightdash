import { SEED_PROJECT } from '@lightdash/common';

describe('Project Permissions', () => {
    it('Organization admin can see projects', () => {
        cy.login();

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.get('[data-cy="settings-button"]').should('exist');
        cy.contains('Explore');
        cy.contains('Welcome, David');
    });

    it('Organization members without project permission cannot see projects', () => {
        cy.loginWithPermissions('member', []);

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.contains("You don't have access");
    });

    it('Organization members with project permission can see project', () => {
        cy.loginWithPermissions('member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.get('[data-cy="settings-button"]').should('exist');
        cy.contains('Explore');
        cy.contains('Welcome, test');
    });
    it('Organization editors without project permission can still see projects', () => {
        cy.loginWithPermissions('editor', []);

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.get('[data-cy="settings-button"]').should('exist');
        cy.contains('Explore');
        cy.contains('Welcome, test');
    });

    it('Organization admins without project permission can still see projects', () => {
        cy.loginWithPermissions('admin', []);

        cy.visit(`/projects/${SEED_PROJECT.project_uuid}/home`);
        cy.get('[data-cy="settings-button"]').should('exist');
        cy.contains('Explore');
        cy.contains('Welcome, test');
    });
});
