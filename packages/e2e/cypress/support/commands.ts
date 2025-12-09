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
    AnyType,
    ApiChartSummaryListResponse,
    CreateChartInSpace,
    CreateEmbedJwt,
    CreatePersonalAccessToken,
    CreateWarehouseCredentials,
    DashboardBasicDetails,
    OrganizationProject,
    SavedChart,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_ORG_1_EDITOR_PASSWORD,
    SEED_ORG_1_VIEWER_EMAIL,
    SEED_ORG_1_VIEWER_PASSWORD,
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
            loginAsEditor(): Chainable<Element>;
            loginAsViewer(): Chainable<Element>;

            anotherLogin(): Chainable<Element>;

            logout(): Chainable<Element>;

            registerNewUser(): Chainable<Element>;

            invite(email: string, role: string): Chainable<string>;

            registerWithCode(inviteCode: string): Chainable<Element>;

            verifyEmail(): Chainable<Element>;

            addProjectPermission(
                email: string,
                role: string,
                projectUuid: string,
            ): Chainable<Element>;

            loginWithPermissions(
                orgRole: string,
                projectPermissions: ProjectPermission[],
            ): Chainable<Element>;

            loginWithEmail(email: string): Chainable<Element>;

            getApiToken(): Chainable<string>;

            deleteProjectsByName(names: string[]): Chainable;

            deleteDashboardsByName(names: string[]): Chainable;

            deleteChartsByName(names: string[]): Chainable;

            createProject(
                projectName: string,
                warehouseConfig: CreateWarehouseCredentials,
            ): Chainable<string>;
            createSpace(
                projectUuid: string,
                spaceName: string,
            ): Chainable<string>;
            createChartInSpace(
                projectUuid: string,
                body: CreateChartInSpace,
            ): Chainable<SavedChart>;
            dragAndDrop(
                dragSelector: string,
                dropSelector: string,
            ): Chainable<Element>;
            getJwtToken(
                projectUuid: string,
                options?: {
                    userEmail?: string;
                    userExternalId?: string | null;
                    canExportCsv?: boolean;
                    canExportImages?: boolean;
                    canExportPagePdf?: boolean;
                    canDateZoom?: boolean;
                    canExplore?: boolean;
                },
            ): Chainable<string>;

            getMonacoEditorText(): Chainable<string>;
            scrollTreeToItem(itemText: string): Chainable<Element>;
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

Cypress.Commands.add('loginAsEditor', () => {
    cy.session(
        SEED_ORG_1_EDITOR_EMAIL.email,
        () => {
            cy.request({
                url: 'api/v1/login',
                method: 'POST',
                body: {
                    email: SEED_ORG_1_EDITOR_EMAIL.email,
                    password: SEED_ORG_1_EDITOR_PASSWORD.password,
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

Cypress.Commands.add('loginAsViewer', () => {
    cy.session(
        SEED_ORG_1_VIEWER_EMAIL.email,
        () => {
            cy.request({
                url: 'api/v1/login',
                method: 'POST',
                body: {
                    email: SEED_ORG_1_VIEWER_EMAIL.email,
                    password: SEED_ORG_1_VIEWER_PASSWORD.password,
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
    const createToken: CreatePersonalAccessToken = {
        description: 'e2e',
        autoGenerated: true,
        expiresAt: null,
    };
    cy.request({
        url: `api/v1/user/me/personal-access-tokens`,
        headers: { 'Content-type': 'application/json' },
        method: 'POST',
        body: createToken,
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
Cypress.Commands.add(
    'createProject',
    (projectName: string, warehouseConfig: CreateWarehouseCredentials) => {
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
                    project_dir: Cypress.env('DBT_PROJECT_DIR'),
                },
                dbtVersion: 'v1.7',
                warehouseConnection: warehouseConfig || {
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
    },
);

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

Cypress.Commands.add(
    'dragAndDrop',
    (dragSelector: string, dropSelector: string) => {
        cy.get(dragSelector)
            .should('exist')
            .get(dropSelector)
            .should('exist')
            .then(() => {
                const draggable = Cypress.$(dragSelector)[0]; // Pick up this
                const droppable = Cypress.$(dropSelector)[0]; // Drop over this

                const draggableId = draggable.getAttribute(
                    'data-rfd-drag-handle-draggable-id',
                );

                // Execute the drag and drop operation in the browser context
                cy.window().then(
                    (win) =>
                        new Cypress.Promise((resolve) => {
                            // Define the drag and drop function in the browser context
                            const simulateDragAndDrop = (
                                dragElement: HTMLElement,
                                dropElement: HTMLElement,
                            ) => {
                                // Get element positions
                                const dragRect =
                                    dragElement.getBoundingClientRect();
                                const dropRect =
                                    dropElement.getBoundingClientRect();

                                const startPoint = {
                                    x: dragRect.left + dragRect.width / 2,
                                    y: dragRect.top + dragRect.height / 2,
                                };

                                const endPoint = {
                                    x: dropRect.left + dropRect.width / 2,
                                    y: dropRect.top + dropRect.height / 2,
                                };

                                // 1. Mouse down on the draggable
                                const mouseDownEvent = new MouseEvent(
                                    'mousedown',
                                    {
                                        bubbles: true,
                                        cancelable: true,
                                        view: win,
                                        clientX: startPoint.x,
                                        clientY: startPoint.y,
                                    },
                                );
                                dragElement.dispatchEvent(mouseDownEvent);

                                // 2. One small mouse move to trigger drag detection
                                setTimeout(() => {
                                    const mouseMoveStart = new MouseEvent(
                                        'mousemove',
                                        {
                                            bubbles: true,
                                            cancelable: true,
                                            view: win,
                                            clientX: startPoint.x + 5,
                                            clientY: startPoint.y + 5,
                                        },
                                    );
                                    win.document.dispatchEvent(mouseMoveStart);

                                    // 3. Move directly to the drop location
                                    setTimeout(() => {
                                        const mouseMoveFinal = new MouseEvent(
                                            'mousemove',
                                            {
                                                bubbles: true,
                                                cancelable: true,
                                                view: win,
                                                clientX: endPoint.x,
                                                clientY: endPoint.y,
                                            },
                                        );
                                        win.document.dispatchEvent(
                                            mouseMoveFinal,
                                        );

                                        // 4. Mouse up at the drop location
                                        setTimeout(() => {
                                            const mouseUpEvent = new MouseEvent(
                                                'mouseup',
                                                {
                                                    bubbles: true,
                                                    cancelable: true,
                                                    view: win,
                                                    clientX: endPoint.x,
                                                    clientY: endPoint.y,
                                                },
                                            );
                                            win.document.dispatchEvent(
                                                mouseUpEvent,
                                            );

                                            // On complete, allow a little time for React to update the DOM
                                            setTimeout(() => resolve(), 200);
                                        }, 50);
                                    }, 50);
                                }, 50);
                            };

                            simulateDragAndDrop(draggable, droppable);
                        }),
                );

                // Check that an element with the draggable ID now exists inside the drop target
                if (draggableId) {
                    cy.get(dropSelector)
                        .find(`[data-rfd-draggable-id="${draggableId}"]`)
                        .should('exist')
                        .then(() => {
                            cy.log(
                                `Successfully moved ${draggableId} to drop target`,
                            );
                        });
                }
            });
    },
);

Cypress.Commands.add(
    'getJwtToken',
    (
        projectUuid: string,
        options: {
            userEmail?: string;
            userExternalId?: string | null;
            canExportCsv?: boolean;
            canExportImages?: boolean;
            canExportPagePdf?: boolean;
            canDateZoom?: boolean;
            canExplore?: boolean;
        } = {},
    ) => {
        const {
            userEmail = 'test@example.com',
            userExternalId = 'test-user-123',
            canExportCsv = false,
            canExportImages = false,
            canExportPagePdf = false,
            canDateZoom = false,
            canExplore = false,
        } = options;

        // First login to get embed configuration and dashboard UUID
        cy.login();

        let dashboardUuid: string;

        // Get a dashboard UUID from the project
        cy.request({
            url: `api/v1/projects/${projectUuid}/dashboards`,
            method: 'GET',
        }).then((dashboardsResponse) => {
            expect(dashboardsResponse.status).to.eq(200);
            expect(dashboardsResponse.body.results).to.have.length.greaterThan(
                0,
            );
            dashboardUuid = dashboardsResponse.body.results[0].uuid;

            // Get embed configuration to get the encoded secret
            cy.request({
                url: `api/v1/embed/${projectUuid}/config`,
                method: 'GET',
            }).then((configResponse) => {
                expect(configResponse.status).to.eq(200);

                // Create JWT data structure
                const jwtData: CreateEmbedJwt = {
                    content: {
                        type: 'dashboard',
                        projectUuid,
                        dashboardUuid,
                        canExportCsv,
                        canExportImages,
                        canExportPagePdf,
                        canDateZoom,
                        canExplore,
                    },
                    userAttributes: {
                        email: userEmail,
                        externalId: userExternalId || '',
                    },
                    user: {
                        email: userEmail,
                        externalId: userExternalId || undefined,
                    },
                    expiresIn: '1h',
                };

                // Create embed URL to get the JWT token
                cy.request({
                    url: `api/v1/embed/${projectUuid}/get-embed-url`,
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: jwtData,
                }).then((embedUrlResponse) => {
                    expect(embedUrlResponse.status).to.eq(200);

                    // Extract JWT token from the URL (it's in the hash fragment)
                    const { url } = embedUrlResponse.body.results;
                    const jwtToken = url.split('#')[1];

                    // Logout to clear session
                    cy.logout();

                    // Return the JWT token
                    cy.wrap(jwtToken);
                });
            });
        });
    },
);

Cypress.Commands.add('getMonacoEditorText', () => {
    cy.wait(200); // wait for new SQL to load
    cy.get('.monaco-editor').should('exist');
    // NOTE: This is probably the most reliable way to get the SQL from the Monaco editor, without having to target specific classes/ids
    cy.window().then((win: AnyType) => {
        expect(win.monaco).to.be.an('object');
        const editor = win.monaco.editor.getModels()[0];
        const sqlRunnerText = editor.getValue();
        // Normalize the text by removing new lines and converting multiple white spaces to single white space
        const normalizedText = sqlRunnerText
            .replace(/\n/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        cy.wrap(normalizedText);
    });
});

/**
 * Scrolls the virtualized tree to make a specific item visible.
 * This is needed because virtualized lists only render items in the viewport,
 * and standard scrollIntoView() doesn't work with absolute positioning.
 */
Cypress.Commands.add('scrollTreeToItem', (itemText: string) => {
    cy.get('[data-testid="virtualized-tree-scroll-container"]', {
        timeout: 10000,
    }).then(($container) => {
        const container = $container[0];
        const maxScroll = container.scrollHeight;
        const viewportHeight = container.clientHeight;

        container.scrollTop = 0;

        const checkAndScroll = (scrollPosition: number): Cypress.Chainable => {
            container.scrollTop = scrollPosition;

            return cy.wait(200).then(() => {
                const elements = Array.from(container.querySelectorAll('*'));
                const found = elements.find((el) => {
                    const text = el.textContent?.trim() || '';
                    const childTexts = Array.from(el.children)
                        .map((child) => child.textContent?.trim() || '')
                        .join('');
                    const ownText = text.replace(childTexts, '').trim();

                    return (
                        text === itemText ||
                        ownText === itemText ||
                        (text.includes(itemText) && el.children.length === 0)
                    );
                });

                if (found) {
                    return cy.wrap(found);
                }

                const nextScroll = scrollPosition + viewportHeight * 0.5;

                if (nextScroll >= maxScroll - viewportHeight) {
                    container.scrollTop = maxScroll;
                    return cy
                        .wait(200)
                        .then(() =>
                            cy
                                .get(
                                    '[data-testid="virtualized-tree-scroll-container"]',
                                )
                                .within(() => cy.findByText(itemText)),
                        );
                }

                return checkAndScroll(nextScroll);
            });
        };

        return checkAndScroll(0);
    });
});
