import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

describe('JWT Authentication Middleware - User Provisioning', () => {
    const projectUuid = SEED_PROJECT.project_uuid;

    const wrapRequest =
        (jwt?: string) => (options: Partial<Cypress.RequestOptions>) => {
            // Prepare headers with optional JWT token
            const headers: Record<string, string> = {
                'Content-type': 'application/json',
            };
            if (jwt) {
                headers['lightdash-embed-token'] = jwt;
            }

            return cy.request({
                ...options,
                headers: {
                    ...options.headers,
                    ...headers,
                },
            });
        };

    const findUserByExternalId = (externalId: string) =>
        cy
            .task('buildEmbedUserUuid', `external::${externalId}`)
            .then((userUuid) =>
                cy.request({
                    url: `${apiUrl}/org/users/${userUuid}`,
                    method: 'GET',
                    failOnStatusCode: false,
                }),
            );

    const findUsers = () =>
        cy.request({
            url: `${apiUrl}/org/users`,
            method: 'GET',
            failOnStatusCode: false,
        });

    const deleteProvisionedUser = (externalId: string) => {
        // First login as admin to get access to user management
        // cy.login();

        cy.task('buildEmbedUserUuid', `external::${externalId}`)
            .as('userUuid')
            .then((userUuid) => {
                cy.log(
                    `Generated UUID for external ID ${externalId}: ${userUuid}`,
                );

                // Try to delete the user directly by UUID
                cy.request({
                    url: `api/v1/org/user/${userUuid}`,
                    method: 'DELETE',
                    failOnStatusCode: false,
                }).then((deleteResponse) => {
                    if (deleteResponse.status === 200) {
                        cy.log(
                            `Successfully deleted user with UUID: ${userUuid}`,
                        );
                    } else {
                        cy.log(
                            `Failed to delete user with UUID: ${userUuid}, status: ${deleteResponse.status}`,
                        );
                    }
                });

                // Logout to clean up session

                // cy.logout();
            });
    };

    describe('Anonymous JWT Users', () => {
        it('should create anonymous account for JWT without canEdit', () => {
            const now = Date.now();
            const userExternalId = `anon-user-${now}`;
            const userEmail = `anon-${now}@example.com`;

            cy.getJwtToken(projectUuid, {
                userExternalId,
                userEmail,
                canEdit: false,
                canExplore: true,
            }).then((jwt) => {
                const wrappedRequest = wrapRequest(jwt);

                // Try to access an embed endpoint
                wrappedRequest({
                    url: `${apiUrl}/embed/${projectUuid}/dashboard`,
                    method: 'GET',
                    failOnStatusCode: false,
                }).then((response) => {
                    // Should succeed with anonymous account
                    expect(response.status).to.equal(200);
                });

                cy.login();

                findUserByExternalId(userExternalId).then((response) => {
                    expect(response.status).to.equal(404);
                });
            });
        });
    });

    describe('Registered Embed Users with canEdit', () => {
        it('should create a new registered user for JWT with canEdit claim', () => {
            const userExternalId = `embed-user-${Date.now()}`;
            const userEmail = `embed-${Date.now()}@example.com`;

            cy.getJwtToken(projectUuid, {
                userExternalId,
                userEmail,
                canEdit: true,
                canExplore: true,
            }).then((jwt) => {
                const wrappedRequest = wrapRequest(jwt);

                // Test that the user can access endpoints requiring registered user
                wrappedRequest({
                    url: `${apiUrl}/embed/${projectUuid}/dashboard`,
                    method: 'GET',
                    failOnStatusCode: false,
                }).then((response) => {
                    // Should succeed with registered embed account
                    expect(response.status).to.equal(200);
                });

                cy.login();

                findUserByExternalId(userExternalId).then((response) => {
                    expect(response.status).to.equal(200);
                });

                deleteProvisionedUser(userExternalId);
            });
        });

        it('should find existing registered user on subsequent requests', () => {
            const userExternalId = `existing-embed-user-${Date.now()}`;
            const userEmail = `existing-embed-${Date.now()}@example.com`;

            cy.login();

            // Get the current user count to assert later
            findUsers().then((response) => {
                cy.wrap(response.body.results.data.length).as('userCount');
            });

            cy.logout();

            // First request should create the user
            cy.getJwtToken(projectUuid, {
                userExternalId,
                userEmail,
                canEdit: true,
                canExplore: true,
            }).then((firstJwt) => {
                const firstRequest = wrapRequest(firstJwt);

                firstRequest({
                    url: `${apiUrl}/embed/${projectUuid}/dashboard`,
                    method: 'GET',
                    failOnStatusCode: false,
                }).then((firstResponse) => {
                    expect(firstResponse.status).to.be.oneOf([200, 404]);

                    cy.login();

                    // Assert that the user count has increased by 1
                    findUsers().then((response) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        cy.get('@userCount').then((userCount: any) => {
                            const userCountWithProvisioned = userCount + 1;
                            expect(response.body.results.data.length).to.equal(
                                userCountWithProvisioned,
                            );

                            cy.wrap(userCountWithProvisioned).as(
                                'userCountWithProvisioned',
                            );
                        });
                    });

                    cy.logout();

                    // Second request with same external ID should find existing user
                    cy.getJwtToken(projectUuid, {
                        userExternalId, // Same external ID
                        userEmail,
                        canEdit: true,
                        canExplore: true,
                    }).then((secondJwt) => {
                        const secondRequest = wrapRequest(secondJwt);

                        secondRequest({
                            url: `${apiUrl}/embed/${projectUuid}/dashboard`,
                            method: 'GET',
                            failOnStatusCode: false,
                        }).then((secondResponse) => {
                            expect(secondResponse.status).to.be.oneOf([
                                200, 404,
                            ]);
                        });
                    });

                    cy.login();

                    // Assert that the user count has not changed
                    findUsers().then((response) => {
                        cy.get('@userCountWithProvisioned').then(
                            (userCount) => {
                                expect(
                                    response.body.results.data.length,
                                ).to.equal(userCount);
                            },
                        );
                    });

                    deleteProvisionedUser(userExternalId);
                });
            });
        });

        it('should require externalId for canEdit users', () => {
            cy.getJwtToken(projectUuid, {
                userExternalId: null, // No external ID
                canEdit: true,
                canExplore: true,
            }).then((jwt) => {
                const wrappedRequest = wrapRequest(jwt);

                wrappedRequest({
                    url: `${apiUrl}/embed/${projectUuid}/dashboard`,
                    method: 'GET',
                    failOnStatusCode: false,
                }).then((response) => {
                    // Should work as anonymous user since no externalId provided
                    expect(response.status).to.equal(400);
                });
            });
        });
    });
});
