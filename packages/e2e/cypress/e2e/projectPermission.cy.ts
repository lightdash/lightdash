import { SEED_PROJECT } from '@lightdash/common';

describe('Login', () => {
    it('Organization admin can see projects', () => {
        cy.login();

        cy.visit('/');
        cy.contains('Settings');
        cy.get('.bp4-non-ideal-state').should('not.exist');
    });

    it('Organization members without project permission cannot see projects', () => {
        cy.loginWithPermissions('member', []);

        cy.visit('/');
        cy.contains('Settings');
        cy.get('.bp4-non-ideal-state').should('exist');
    });

    it('Organization members with project permission can see project', () => {
        cy.loginWithPermissions('member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);

        cy.visit('/');
        cy.contains('Settings');
        cy.get('.bp4-non-ideal-state').should('not.exist');
    });
    it('Organization editors without project permission can still see projects', () => {
        cy.loginWithPermissions('editor', []);

        cy.visit('/');
        cy.contains('Settings');
        cy.get('.bp4-non-ideal-state').should('not.exist');
    });

    it('Organization admins without project permission can still see projects', () => {
        cy.loginWithPermissions('admin', []);

        cy.visit('/');
        cy.contains('Settings');
        cy.get('.bp4-non-ideal-state').should('not.exist');
    });
});
