import { SEED_ORG_1 } from '@lightdash/common';

describe('Settings - User search', () => {
    const suffix = Date.now();
    const roleName = `Search Analyst ${suffix}`;
    const email = `demo+user-search-${suffix}@lightdash.com`;
    const rolesUrl = `/api/v2/orgs/${SEED_ORG_1.organization_uuid}/roles`;
    let roleUuid: string;
    let userUuid: string;

    before(() => {
        cy.login();
        cy.request('POST', rolesUrl, {
            name: roleName,
            level: 'organization',
            scopes: ['view:Organization'],
        }).then((response) => {
            roleUuid = response.body.results.roleUuid;
        });
        cy.request('POST', '/api/v1/invite-links', {
            role: 'viewer',
            email,
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
        }).then((response) => {
            cy.request('POST', '/api/v1/user', {
                inviteCode: response.body.results.inviteCode,
                firstName: 'Search',
                lastName: `Tester${suffix}`,
                password: 'TestPassword123!',
            });
            cy.request('/api/v1/user/me/email/status?passcode=000000');
        });
        cy.login();
        cy.request({
            url: '/api/v1/org/users',
            qs: { searchQuery: email },
        }).then((response) => {
            userUuid = response.body.results.data[0].userUuid;
            cy.request('POST', `${rolesUrl}/assignments/user/${userUuid}`, {
                roleId: roleUuid,
            });
        });
    });

    after(() => {
        cy.login();
        if (userUuid) cy.request('DELETE', `/api/v1/org/user/${userUuid}`);
        if (roleUuid) cy.request('DELETE', `${rolesUrl}/${roleUuid}`);
    });

    beforeEach(() => {
        cy.login();
        cy.visit('/generalSettings/userManagement');
    });

    const search = (query: string) => {
        cy.intercept({
            method: 'GET',
            pathname: '/api/v1/org/users',
            query: { searchQuery: query },
        }).as('searchResults');
        cy.findByTestId('org-users-search-input').clear().type(query);
        cy.wait('@searchResults');
    };

    it('finds users by a multi-word custom role and excludes single-word matches', () => {
        search(`  ${roleName.toUpperCase()}  `);
        cy.get('table tbody tr').should('have.length', 1).and('contain', email);

        search(`Search Nonexistent${suffix}`);
        cy.get('table').should('not.contain', email);
        cy.get('table tbody').should('not.contain', '@lightdash.com');
    });

    it('preserves full-name, email, partial-role, and system-role searches', () => {
        search(`Search Tester${suffix}`);
        cy.get('table tbody tr').should('have.length', 1).and('contain', email);
        search(email);
        cy.get('table tbody tr').should('have.length', 1).and('contain', email);
        search(`Analyst ${suffix}`);
        cy.get('table tbody tr').should('have.length', 1).and('contain', email);
        search('admin');
        cy.get('table tbody tr').should('have.length.at.least', 1);
        cy.get('table').should('not.contain', email);
    });
});
