import { OAuthIntrospectRequest, OAuthTokenRequest } from '@lightdash/common';

describe('OAuth API Integration Tests', () => {
    const apiUrl = '/api/v1/oauth';

    // PKCE test values - these are pre-computed for testing
    const PKCE_TEST_VALUES = {
        codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    };

    // No global login - each test will handle its own authentication state

    describe('OAuth Discovery', () => {
        it('Should return OAuth server metadata', () => {
            cy.request({
                method: 'GET',
                url: `${apiUrl}/.well-known/oauth-authorization-server`,
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body).to.have.property('issuer');
                expect(response.body).to.have.property(
                    'authorization_endpoint',
                );
                expect(response.body).to.have.property('token_endpoint');
                expect(response.body).to.have.property(
                    'introspection_endpoint',
                );
                expect(response.body).to.have.property('revocation_endpoint');
                expect(response.body.response_types_supported).to.include(
                    'code',
                );
                expect(response.body.grant_types_supported).to.include(
                    'authorization_code',
                );
                expect(response.body.grant_types_supported).to.include(
                    'refresh_token',
                );
                expect(
                    response.body.code_challenge_methods_supported,
                ).to.include('S256');
                expect(
                    response.body.code_challenge_methods_supported,
                ).to.include('plain');

                // OAuth2 endpoints should not have the {status, results} wrapper
                expect(response.body).to.not.have.property('status');
                expect(response.body).to.not.have.property('results');
            });
        });
    });

    describe('OAuth Authorization Flow', () => {
        it('Should redirect to login when user is not authenticated', () => {
            cy.request({
                method: 'GET',
                url: `${apiUrl}/authorize`,
                qs: {
                    response_type: 'code',
                    client_id: 'test-client',
                    redirect_uri: 'http://localhost:3000/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((response) => {
                expect(response.status).to.eq(302);
                expect(response.headers.location).to.include('/login');
            });
        });

        it('Should return authorization code for authenticated user', () => {
            cy.login();
            cy.request({
                method: 'GET',
                url: `${apiUrl}/authorize`,
                qs: {
                    response_type: 'code',
                    client_id: 'lightdash-cli',
                    redirect_uri: 'http://localhost:3000/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((response) => {
                expect(response.status).to.eq(302);
                const { location } = response.headers;
                if (typeof location === 'string') {
                    const redirectUrl = new URL(location);
                    expect(redirectUrl.searchParams.get('code')).to.not.eq(
                        null,
                    );
                    expect(redirectUrl.searchParams.get('state')).to.eq(
                        'test-state',
                    );
                }
            });
        });
    });

    describe('OAuth Token Endpoint', () => {
        it('Should exchange authorization code for access token', () => {
            cy.login();
            cy.request({
                method: 'GET',
                url: `${apiUrl}/authorize`,
                qs: {
                    response_type: 'code',
                    client_id: 'lightdash-cli',
                    redirect_uri: 'http://localhost:3000/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((authResponse) => {
                const { location } = authResponse.headers;
                let code = '';
                if (typeof location === 'string') {
                    const redirectUrl = new URL(location);
                    code = redirectUrl.searchParams.get('code') || '';
                }

                // Exchange code for token
                const tokenRequest: OAuthTokenRequest = {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: 'cli-secret',
                    redirect_uri: 'http://localhost:3000/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                };

                cy.request({
                    method: 'POST',
                    url: `${apiUrl}/token`,
                    body: tokenRequest,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }).then((tokenResponse) => {
                    expect(tokenResponse.status).to.eq(200);
                    expect(tokenResponse.body).to.have.property('access_token');
                    expect(tokenResponse.body).to.have.property(
                        'token_type',
                        'Bearer',
                    );
                    expect(tokenResponse.body).to.have.property('expires_in');
                    expect(tokenResponse.body).to.have.property(
                        'refresh_token',
                    );
                    expect(tokenResponse.body).to.have.property('scope');

                    // OAuth2 endpoints should not have the {status, results} wrapper
                    expect(tokenResponse.body).to.not.have.property('status');
                    expect(tokenResponse.body).to.not.have.property('results');
                });
            });
        });

        it('Should refresh access token using refresh token', () => {
            cy.login();
            cy.request({
                method: 'GET',
                url: `${apiUrl}/authorize`,
                qs: {
                    response_type: 'code',
                    client_id: 'lightdash-cli',
                    redirect_uri: 'http://localhost:3000/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((authResponse) => {
                const { location } = authResponse.headers;
                let code = '';
                if (typeof location === 'string') {
                    const redirectUrl = new URL(location);
                    code = redirectUrl.searchParams.get('code') || '';
                }

                // Get initial tokens
                const tokenRequest: OAuthTokenRequest = {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: 'cli-secret',
                    redirect_uri: 'http://localhost:3000/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                };

                cy.request({
                    method: 'POST',
                    url: `${apiUrl}/token`,
                    body: tokenRequest,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }).then((tokenResponse) => {
                    const refreshTokenRequest: OAuthTokenRequest = {
                        grant_type: 'refresh_token',
                        refresh_token: tokenResponse.body.refresh_token,
                        client_id: 'lightdash-cli',
                        client_secret: 'cli-secret',
                    };

                    cy.request({
                        method: 'POST',
                        url: `${apiUrl}/token`,
                        body: refreshTokenRequest,
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                    }).then((refreshResponse) => {
                        expect(refreshResponse.status).to.eq(200);
                        expect(refreshResponse.body).to.have.property(
                            'access_token',
                        );
                        expect(refreshResponse.body).to.have.property(
                            'token_type',
                            'Bearer',
                        );
                        expect(refreshResponse.body).to.have.property(
                            'expires_in',
                        );
                        expect(refreshResponse.body.access_token).to.not.eq(
                            tokenResponse.body.access_token,
                        );

                        // OAuth2 endpoints should not have the {status, results} wrapper
                        expect(refreshResponse.body).to.not.have.property(
                            'status',
                        );
                        expect(refreshResponse.body).to.not.have.property(
                            'results',
                        );
                    });
                });
            });
        });

        it('Should reject invalid authorization code', () => {
            const tokenRequest: OAuthTokenRequest = {
                grant_type: 'authorization_code',
                code: 'invalid-code',
                client_id: 'lightdash-cli',
                client_secret: 'cli-secret',
                redirect_uri: 'http://localhost:3000/callback',
            };

            cy.request({
                method: 'POST',
                url: `${apiUrl}/token`,
                body: tokenRequest,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(401);
                expect(response.body).to.have.property('error');

                // OAuth2 error responses should not have the {status, results} wrapper
                expect(response.body).to.not.have.property('status');
                expect(response.body).to.not.have.property('results');
            });
        });

        it('Should reject client credentials grant type', () => {
            const tokenRequest: OAuthTokenRequest = {
                grant_type: 'client_credentials',
                client_id: 'lightdash-cli',
                client_secret: 'cli-secret',
            };

            cy.request({
                method: 'POST',
                url: `${apiUrl}/token`,
                body: tokenRequest,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(401);
                expect(response.body).to.have.property(
                    'error',
                    'unsupported_grant_type',
                );
                expect(response.body).to.have.property('error_description');
                expect(response.body.error_description).to.include(
                    'Client credentials grant not implemented yet',
                );

                // OAuth2 error responses should not have the {status, results} wrapper
                expect(response.body).to.not.have.property('status');
                expect(response.body).to.not.have.property('results');
            });
        });
    });

    describe('OAuth Token Introspection', () => {
        it('Should introspect valid access token', () => {
            cy.login();
            cy.request({
                method: 'GET',
                url: `${apiUrl}/authorize`,
                qs: {
                    response_type: 'code',
                    client_id: 'lightdash-cli',
                    redirect_uri: 'http://localhost:3000/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((authResponse) => {
                const { location } = authResponse.headers;
                let code = '';
                if (typeof location === 'string') {
                    const redirectUrl = new URL(location);
                    code = redirectUrl.searchParams.get('code') || '';
                }

                const tokenRequest: OAuthTokenRequest = {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: 'cli-secret',
                    redirect_uri: 'http://localhost:3000/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                };

                cy.request({
                    method: 'POST',
                    url: `${apiUrl}/token`,
                    body: tokenRequest,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }).then((tokenResponse) => {
                    const introspectRequest: OAuthIntrospectRequest = {
                        token: tokenResponse.body.access_token,
                        token_type_hint: 'access_token',
                    };

                    cy.request({
                        method: 'POST',
                        url: `${apiUrl}/introspect`,
                        body: introspectRequest,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    }).then((introspectResponse) => {
                        expect(introspectResponse.status).to.eq(200);
                        expect(introspectResponse.body).to.have.property(
                            'active',
                            true,
                        );

                        expect(introspectResponse.body).to.have.property(
                            'scope',
                        );
                        expect(introspectResponse.body).to.have.property(
                            'client_id',
                        );
                        expect(introspectResponse.body).to.have.property(
                            'username',
                        );
                        expect(introspectResponse.body).to.have.property(
                            'token_type',
                            'access_token',
                        );
                        expect(introspectResponse.body).to.have.property('exp');
                        expect(introspectResponse.body).to.have.property('iat');
                        expect(introspectResponse.body).to.have.property('sub');
                        expect(introspectResponse.body).to.have.property('aud');
                        expect(introspectResponse.body).to.have.property(
                            'iss',
                            'lightdash',
                        );
                        expect(introspectResponse.body).to.have.property('jti');

                        // OAuth2 endpoints should not have the {status, results} wrapper
                        expect(introspectResponse.body).to.not.have.property(
                            'status',
                        );
                        expect(introspectResponse.body).to.not.have.property(
                            'results',
                        );

                        // Validate username is the email of the user
                        expect(introspectResponse.body.username).to.be.eq(
                            'demo@lightdash.com',
                        );
                    });
                });
            });
        });

        it('Should return inactive for invalid token', () => {
            const introspectRequest: OAuthIntrospectRequest = {
                token: 'invalid-token',
                token_type_hint: 'access_token',
            };

            cy.request({
                method: 'POST',
                url: `${apiUrl}/introspect`,
                body: introspectRequest,
                headers: {
                    'Content-Type': 'application/json',
                },
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body).to.have.property('active', false);

                // OAuth2 endpoints should not have the {status, results} wrapper
                expect(response.body).to.not.have.property('status');
                expect(response.body).to.not.have.property('results');
            });
        });
    });

    describe('OAuth Token Revocation', () => {
        it('Should revoke access token', () => {
            cy.login();
            cy.request({
                method: 'GET',
                url: `${apiUrl}/authorize`,
                qs: {
                    response_type: 'code',
                    client_id: 'lightdash-cli',
                    redirect_uri: 'http://localhost:3000/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((authResponse) => {
                const { location } = authResponse.headers;
                let code = '';
                if (typeof location === 'string') {
                    const redirectUrl = new URL(location);
                    code = redirectUrl.searchParams.get('code') || '';
                }

                const tokenRequest: OAuthTokenRequest = {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: 'cli-secret',
                    redirect_uri: 'http://localhost:3000/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                };

                cy.request({
                    method: 'POST',
                    url: `${apiUrl}/token`,
                    body: tokenRequest,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }).then((tokenResponse) => {
                    const revokeRequest = {
                        token: tokenResponse.body.access_token,
                        token_type_hint: 'access_token',
                    };

                    cy.request({
                        method: 'POST',
                        url: `${apiUrl}/revoke`,
                        body: revokeRequest,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    }).then((revokeResponse) => {
                        expect(revokeResponse.status).to.eq(200);

                        // OAuth2 revoke endpoint returns empty response body (RFC 7009)
                        expect(revokeResponse.body).to.eq(undefined);

                        // Verify token is revoked by introspecting it
                        const introspectRequest: OAuthIntrospectRequest = {
                            token: tokenResponse.body.access_token,
                            token_type_hint: 'access_token',
                        };

                        cy.request({
                            method: 'POST',
                            url: `${apiUrl}/introspect`,
                            body: introspectRequest,
                            headers: {
                                'Content-Type': 'application/json',
                            },
                        }).then((introspectResponse) => {
                            expect(introspectResponse.status).to.eq(200);
                            expect(introspectResponse.body).to.have.property(
                                'active',
                                false,
                            );
                        });
                    });
                });
            });
        });
    });

    describe('OAuth Authentication Middleware', () => {
        it('Should authenticate with valid OAuth token', () => {
            cy.login();
            cy.request({
                method: 'GET',
                url: `${apiUrl}/authorize`,
                qs: {
                    response_type: 'code',
                    client_id: 'lightdash-cli',
                    redirect_uri: 'http://localhost:3000/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((authResponse) => {
                const { location } = authResponse.headers;
                let code = '';
                if (typeof location === 'string') {
                    const redirectUrl = new URL(location);
                    code = redirectUrl.searchParams.get('code') || '';
                }

                const tokenRequest: OAuthTokenRequest = {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: 'cli-secret',
                    redirect_uri: 'http://localhost:3000/callback',
                    code_verifier: PKCE_TEST_VALUES.codeVerifier,
                };

                cy.request({
                    method: 'POST',
                    url: `${apiUrl}/token`,
                    body: tokenRequest,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }).then((tokenResponse) => {
                    // Test that the token can be used to access protected endpoints
                    cy.request({
                        method: 'GET',
                        url: '/api/v1/user',
                        headers: {
                            Authorization: `Bearer ${tokenResponse.body.access_token}`,
                        },
                    }).then((userResponse) => {
                        expect(userResponse.status).to.eq(200);
                        expect(userResponse.body).to.have.property(
                            'status',
                            'ok',
                        );
                        expect(userResponse.body).to.have.property('results');
                        expect(userResponse.body.results).to.have.property(
                            'userUuid',
                        );
                        expect(userResponse.body.results).to.have.property(
                            'organizationUuid',
                        );
                    });
                });
            });
        });

        it('Should reject invalid OAuth token', () => {
            cy.request({
                method: 'GET',
                url: '/api/v1/user',
                headers: {
                    Authorization: 'Bearer invalid-token',
                },
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(401);
            });
        });
    });
});
