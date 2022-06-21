import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

const inviteUser = (
    email: string,
    role: string,
    callback: (inviteCode: string) => void,
) => {
    // Admin creates a new invitation for new member user

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // in 1 day

    cy.request({
        url: `${apiUrl}/invite-links`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            role,
            email,
            expiresAt,
        },
    }).then((resp) => {
        cy.log(JSON.stringify(resp.body.results));
        expect(resp.status).to.eq(201);
        callback(resp.body.results.inviteCode);
    });
};

const addProjectPermission = (email: string, role: string) => {
    // Admin assigns a project role to new user

    cy.request({
        url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/access`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            role,
            email,
        },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
    });
};
const registerUser = (inviteCode: string, email: string) => {
    // Register with new user
    cy.request({
        url: `${apiUrl}/user`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            inviteCode,
            email,
            firstName: 'test',
            lastName: 'test',
            password: 'test',
        },
    }).then((resp) => {
        cy.log(JSON.stringify(resp.body));
        expect(resp.status).to.eq(200);
    });
};

describe('Login', () => {
    it('Organization admin can see projects', () => {
        cy.login();

        cy.visit('/');
        cy.contains('Settings');
        cy.get('.bp4-non-ideal-state').should('not.exist');
    });

    it('Organization members without project permission cannot see projects', () => {
        cy.login();

        const email = `member-${new Date().getTime()}@lightdash.com`;
        inviteUser(email, 'member', (inviteCode) => {
            registerUser(inviteCode, email);

            cy.visit('/');
            cy.contains('Settings');
            cy.get('.bp4-non-ideal-state').should('exist');
        });
    });

    it('Organization members with project permission can see project', () => {
        cy.login();

        const email = `member${new Date().getTime()}@lightdash.com`;

        inviteUser(email, 'member', (inviteCode) => {
            addProjectPermission(email, 'editor');

            registerUser(inviteCode, email);
            cy.visit('/');
            cy.contains('Settings');
            // TODO cy.get('.bp4-non-ideal-state').should('not.exist');
        });
    });
    it('Organization editors without project permission can still see projects', () => {
        cy.login();

        const email = `editor${new Date().getTime()}@lightdash.com`;

        inviteUser(email, 'editor', (inviteCode) => {
            registerUser(inviteCode, email);
            cy.visit('/');

            cy.contains('Settings');
            cy.get('.bp4-non-ideal-state').should('not.exist');
        });
    });
});
