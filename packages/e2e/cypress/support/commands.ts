// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
import {
    ApiChartSummaryListResponse,
    CreateChartInSpace,
    DashboardBasicDetails,
    OrganizationProject,
    SavedChart,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_ORG_2_ADMIN_EMAIL,
    SEED_ORG_2_ADMIN_PASSWORD,
    SEED_PROJECT,
} from '@lightdash/common';
import '@testing-library/cypress/add-commands';
import 'cypress-file-upload';

declare global {
    namespace Cypress {
        interface Chainable {
            selectMantine(
                inputName: string,
                optionLabel: string,
            ): Chainable<Element>;

            login(): Chainable<Element>;

            anotherLogin(): Chainable<Element>;

            logout(): Chainable<Element>;

            registerNewUser(): Chainable<Element>;

            invite(email, role): Chainable<string>;

            registerWithCode(inviteCode): Chainable<Element>;

            verifyEmail(): Chainable<Element>;

            addProjectPermission(email, role, projectUuid): Chainable<Element>;

            loginWithPermissions(
                orgRole,
                projectPermissions,
            ): Chainable<Element>;

            loginWithEmail: (email) => Chainable<Element>;

            getApiToken(): Chainable<string>;

            deleteProjectsByName(names: string[]): Chainable;

            deleteDashboardsByName(names: string[]): Chainable;

            deleteChartsByName(names: string[]): Chainable;

            createProject(projectName: string): Chainable<string>;
            createSpace(
                projectUuid: string,
                spaceName: string,
            ): Chainable<string>;
            createChartInSpace(
                projectUuid: string,
                body: CreateChartInSpace,
            ): Chainable<SavedChart>;
        }
    }
}

/**
 * Ignore uncaught resize observer exceptions. These are supposed to be
 * benign, but they are making our tests fail. This is a solution from
 * this thread:
 * https://stackoverflow.com/questions/49384120/resizeobserver-loop-limit-exceeded
 */
const resizeObserverLoopErrRe = /^[^(ResizeObserver loop limit exceeded)]/;
Cypress.on('uncaught:exception', (err) => {
    /* returning false here prevents Cypress from failing the test */
    if (resizeObserverLoopErrRe.test(err.message)) {
        return false;
    }
    return true;
});

Cypress.Commands.add(
    'selectMantine',
    (inputName: string, optionLabel: string) => {
        cy.get(`input[name="${inputName}"]`)
            .parent()
            .click() // open dropdown
            .parent('.mantine-Select-root')
            .contains(optionLabel)
            .click(); // click option
    },
);

Cypress.Commands.add('login', () => {
    cy.session(
        SEED_ORG_1_ADMIN_EMAIL.email,
        () => {
            cy.request({
                url: 'api/v1/login',
                method: 'POST',
                body: {
                    email: SEED_ORG_1_ADMIN_EMAIL.email,
                    password: SEED_ORG_1_ADMIN_PASSWORD.password,
                },
            })
                .its('status')
                .should('eq', 200);
        },
        {
            validate() {
                cy.request('api/v1/user').its('status').should('eq', 200);
            },
        },
    );
});

Cypress.Commands.add('anotherLogin', () => {
    cy.session(
        SEED_ORG_2_ADMIN_EMAIL.email,
        () => {
            cy.request({
                url: 'api/v1/login',
                method: 'POST',
                body: {
                    email: SEED_ORG_2_ADMIN_EMAIL.email,
                    password: SEED_ORG_2_ADMIN_PASSWORD.password,
                },
            })
                .its('status')
                .should('eq', 200);
        },
        {
            validate() {
                cy.request('api/v1/user').its('status').should('eq', 200);
            },
        },
    );
});
Cypress.Commands.add('registerNewUser', () => {
    const email = `demo+${new Date().getTime()}@lightdash.com`;
    cy.request({
        url: 'api/v1/user',
        method: 'POST',
        body: {
            firstName: 'Test',
            lastName: 'e2e',
            email,
            password: 'demo_password!',
        },
    });
});

Cypress.Commands.add('registerWithCode', (inviteCode: string) => {
    cy.request({
        url: `api/v1/user`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            inviteCode,
            firstName: 'test',
            lastName: 'test',
            password: 'test1234',
        },
    }).then((resp) => {
        cy.log(JSON.stringify(resp.body));
        expect(resp.status).to.eq(200);
    });
});

Cypress.Commands.add('verifyEmail', () => {
    cy.request({
        url: `api/v1/user/me/email/status?passcode=000000`,
        headers: { 'Content-type': 'application/json' },
        method: 'GET',
        body: undefined,
    }).then((resp) => {
        cy.log(JSON.stringify(resp.body));
        expect(resp.status).to.eq(200);
    });
});

Cypress.Commands.add('invite', (email: string, role: string) => {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // in 1 day

    cy.request({
        url: `api/v1/invite-links`,
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
        cy.wrap(resp.body.results.inviteCode);
    });
});

Cypress.Commands.add(
    'addProjectPermission',
    (email: string, role: string, projectUuid: string) => {
        cy.request({
            url: `api/v1/projects/${projectUuid}/access`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {
                role,
                email,
                sendEmail: false,
            },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
        });
    },
);

Cypress.Commands.add('logout', () => {
    cy.request({
        url: 'api/v1/logout',
        method: 'GET',
    });
});

type ProjectPermission = {
    role: string;
    projectUuid: string;
};
Cypress.Commands.add(
    'loginWithPermissions',
    (orgRole: string, projectPermissions: ProjectPermission[]) => {
        cy.login();

        const email = `demo+${orgRole}-${new Date().getTime()}@lightdash.com`;

        cy.invite(email, orgRole).then((inviteCode) => {
            projectPermissions.forEach((projectPermission) => {
                cy.addProjectPermission(
                    email,
                    projectPermission.role,
                    projectPermission.projectUuid,
                );
            });

            cy.registerWithCode(inviteCode);
            cy.verifyEmail();
            cy.wrap(email);
        });
    },
);

Cypress.Commands.add('loginWithEmail', (email: string) => {
    cy.session(
        email,
        () => {
            cy.request({
                url: 'api/v1/login',
                method: 'POST',
                body: {
                    email,
                    password: 'test1234',
                },
            })
                .its('status')
                .should('eq', 200);
        },
        {},
    );
});
Cypress.Commands.add('getApiToken', () => {
    cy.request({
        url: `api/v1/user/me/personal-access-tokens`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            description: 'e2e',
            autoGenerated: false,
        },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
        cy.wrap(resp.body.results.token, { log: false });
    });
});
Cypress.Commands.add('deleteProjectsByName', (names: string[]) => {
    cy.request({
        url: `api/v1/org/projects`,
        headers: { 'Content-type': 'application/json' },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
        (resp.body.results as OrganizationProject[]).forEach(
            ({ projectUuid, name }) => {
                if (names.includes(name)) {
                    cy.request({
                        url: `api/v1/org/projects/${projectUuid}`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'DELETE',
                    }).then((deleteResp) => {
                        expect(deleteResp.status).to.eq(200);
                    });
                }
            },
        );
    });
});
Cypress.Commands.add('deleteDashboardsByName', (names: string[]) => {
    cy.request<{
        results: DashboardBasicDetails[];
    }>(`api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`).then(
        (resp) => {
            expect(resp.status).to.eq(200);
            resp.body.results.forEach(({ uuid, name }) => {
                if (names.includes(name)) {
                    cy.request({
                        url: `api/v1/dashboards/${uuid}`,
                        headers: { 'Content-type': 'application/json' },
                        method: 'DELETE',
                    }).then((deleteResp) => {
                        expect(deleteResp.status).to.eq(200);
                    });
                }
            });
        },
    );
});
Cypress.Commands.add('deleteChartsByName', (names: string[]) => {
    cy.request<ApiChartSummaryListResponse>({
        url: `api/v1/projects/${SEED_PROJECT.project_uuid}/charts`,
        headers: { 'Content-type': 'application/json' },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
        resp.body.results.forEach(({ uuid, name }) => {
            if (names.includes(name)) {
                cy.request({
                    url: `api/v1/saved/${uuid}`,
                    headers: { 'Content-type': 'application/json' },
                    method: 'DELETE',
                }).then((deleteResp) => {
                    expect(deleteResp.status).to.eq(200);
                });
            }
        });
    });
});
Cypress.Commands.add('createProject', (projectName: string) => {
    cy.request({
        url: `api/v1/org/projects`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: {
            name: projectName,
            type: 'DEFAULT',
            dbtConnection: {
                target: '',
                environment: [],
                type: 'dbt',
            },
            dbtVersion: 'v1.4',
            warehouseConnection: {
                host: Cypress.env('PGHOST') || 'localhost',
                user: 'postgres',
                password: Cypress.env('PGPASSWORD') || 'password',
                dbname: 'postgres',
                searchPath: '',
                role: '',
                sshTunnelHost: '',
                sshTunnelUser: '',
                schema: 'jaffle',
                port: 5432,
                keepalivesIdle: 0,
                sslmode: 'disable',
                sshTunnelPort: 22,
                requireUserCredentials: false,
                type: 'postgres',
            },
        },
    }).then((resp) => {
        expect(resp.status).to.eq(200);
        const { projectUuid } = resp.body.results.project;
        cy.log(`Create project ${projectName} with uuid ${projectUuid}`);
        cy.wrap(projectUuid);
    });
});

Cypress.Commands.add(
    'createSpace',
    (projectUuid: string, spaceName: string) => {
        // Creates a public space in project
        cy.request({
            url: `api/v1/projects/${projectUuid}/spaces/`,
            headers: { 'Content-type': 'application/json' },
            method: 'POST',
            body: {
                name: spaceName,
                isPrivate: false,
            },
        }).then((resp) => {
            expect(resp.status).to.eq(200);
            const spaceUuid = resp.body.results.uuid;
            cy.log(`Created space ${spaceName} with uuid ${spaceUuid}`);
            cy.wrap(spaceUuid);
        });
    },
);
Cypress.Commands.add(
    'createChartInSpace',
    (projectUuid: string, body: CreateChartInSpace) => {
        cy.request<{
            results: SavedChart;
        }>({
            method: 'POST',
            url: `api/v1/projects/${projectUuid}/saved`,
            body,
        }).then((response) => {
            expect(response.status).to.eq(200);
            const chart = response.body.results;
            cy.log(`Created chart ${body.name} with uuid ${chart.uuid}`);
            cy.wrap(chart);
        });
    },
);
