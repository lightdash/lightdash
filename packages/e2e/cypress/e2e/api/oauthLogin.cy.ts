import { OAuthIntrospectRequest, OAuthTokenRequest } from '@lightdash/common';

describe('OAuth API Integration Tests', () => {
    const apiUrl = '/api/v1/oauth';

    // PKCE test values - these are pre-computed for testing
    const PKCE_TEST_VALUES = {
        codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
        codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    };

    // Helper to extract redirect URL from HTML response
    const extractRedirectUrlFromHtml = (html: string): string => {
        const match = /window\.location\.href = "([^"]+)"/.exec(html);
        if (!match) {
            throw new Error('No redirect URL found in HTML response');
        }
        return match[1];
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
                    redirect_uri: 'http://localhost:8100/callback',
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

        it('Should return return authorization page with hidden fields to submit', () => {
            cy.login();
            cy.request({
                method: 'GET',
                url: `${apiUrl}/authorize`,
                qs: {
                    response_type: 'code',
                    client_id: 'lightdash-cli',
                    redirect_uri: 'http://localhost:8100/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((getResponse) => {
                const html = getResponse.body;
                const extract = (name: string) => {
                    const match = new RegExp(
                        `<input[^>]+name=["']${name}["'][^>]+value=["']([^"']*)["']`,
                    ).exec(html);
                    return match ? match[1] : '';
                };
                const formData = {
                    response_type: extract('response_type'),
                    client_id: extract('client_id'),
                    redirect_uri: extract('redirect_uri'),
                    scope: extract('scope'),
                    state: extract('state'),
                    code_challenge: extract('code_challenge'),
                    code_challenge_method: extract('code_challenge_method'),
                    approve: 'true',
                };
                expect(formData.response_type).to.eq('code');
                expect(formData.client_id).to.eq('lightdash-cli');
                expect(formData.redirect_uri).to.eq(
                    'http://localhost:8100/callback',
                );
                expect(formData.scope).to.eq('read write');
                expect(formData.state).to.eq('test-state');
                expect(formData.code_challenge).to.eq(
                    PKCE_TEST_VALUES.codeChallenge,
                );
                expect(formData.code_challenge_method).to.eq('S256');
            });
        });
        it('Submit POST /authorize returns authorization code', () => {
            cy.login();
            const formData = {
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
                approve: 'true',
            };

            cy.request({
                method: 'POST',
                url: `${apiUrl}/authorize`,
                form: true,
                body: formData,
                followRedirect: false,
            }).then((postResponse) => {
                expect(postResponse.status).to.eq(200);
                // Extract redirect URL from HTML response
                const location = extractRedirectUrlFromHtml(postResponse.body);
                const redirectUrl = new URL(location);
                const code = redirectUrl.searchParams.get('code') || '';

                expect(
                    code,
                    `Authorization code should not be empty. Redirect: ${location}`,
                ).to.not.eq('');
                expect(redirectUrl.searchParams.get('state')).to.eq(
                    'test-state',
                );
            });
        });
    });

    describe('OAuth Token Endpoint', () => {
        it('Should exchange authorization code for access token', () => {
            cy.login();
            const formData = {
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
                approve: 'true',
            };

            cy.request({
                method: 'POST',
                url: `${apiUrl}/authorize`,
                form: true,
                body: formData,
                followRedirect: false,
            }).then((postResponse) => {
                expect(postResponse.status).to.eq(200);
                const location = extractRedirectUrlFromHtml(postResponse.body);
                const redirectUrl = new URL(location);
                const code = redirectUrl.searchParams.get('code') || '';

                expect(
                    code,
                    `Authorization code should not be empty. Redirect: ${location}`,
                ).to.not.eq('');
                expect(redirectUrl.searchParams.get('state')).to.eq(
                    'test-state',
                );

                // Exchange code for token
                const tokenRequest: OAuthTokenRequest = {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: '',
                    redirect_uri: 'http://localhost:8100/callback',
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

            const formData = {
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
                approve: 'true',
            };

            cy.request({
                method: 'POST',
                url: `${apiUrl}/authorize`,
                form: true,
                body: formData,
                followRedirect: false,
            }).then((postResponse) => {
                expect(postResponse.status).to.eq(200);
                const location = extractRedirectUrlFromHtml(postResponse.body);
                const redirectUrl = new URL(location);
                const code = redirectUrl.searchParams.get('code') || '';

                expect(
                    code,
                    `Authorization code should not be empty. Redirect: ${location}`,
                ).to.not.eq('');
                expect(redirectUrl.searchParams.get('state')).to.eq(
                    'test-state',
                );

                // Exchange code for token
                const tokenRequest: OAuthTokenRequest = {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: '',
                    redirect_uri: 'http://localhost:8100/callback',
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

                    const refreshTokenRequest: OAuthTokenRequest = {
                        grant_type: 'refresh_token',
                        refresh_token: tokenResponse.body.refresh_token,
                        client_id: 'lightdash-cli',
                        client_secret: '', // No secret is required for refresh token
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
                client_secret: '',
                redirect_uri: 'http://localhost:8100/callback',
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
                client_secret: '',
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

                // OAuth2 error responses should not have the {status, results} wrapper
                expect(response.body).to.not.have.property('status');
                expect(response.body).to.not.have.property('results');
            });
        });
    });

    describe('OAuth Token Introspection', () => {
        it('Should introspect valid access token', () => {
            cy.login();

            const formData = {
                response_type: 'code',
                client_id: 'lightdash-cli',
                redirect_uri: 'http://localhost:8100/callback',
                scope: 'read write',
                state: 'test-state',
                code_challenge: PKCE_TEST_VALUES.codeChallenge,
                code_challenge_method: 'S256',
                approve: 'true',
            };

            cy.request({
                method: 'POST',
                url: `${apiUrl}/authorize`,
                form: true,
                body: formData,
                followRedirect: false,
            }).then((postResponse) => {
                expect(postResponse.status).to.eq(200);
                const location = extractRedirectUrlFromHtml(postResponse.body);
                const redirectUrl = new URL(location);
                const code = redirectUrl.searchParams.get('code') || '';

                expect(
                    code,
                    `Authorization code should not be empty. Redirect: ${location}`,
                ).to.not.eq('');
                expect(redirectUrl.searchParams.get('state')).to.eq(
                    'test-state',
                );

                // Exchange code for token
                const tokenRequest: OAuthTokenRequest = {
                    grant_type: 'authorization_code',
                    code,
                    client_id: 'lightdash-cli',
                    client_secret: '',
                    redirect_uri: 'http://localhost:8100/callback',
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
                            Authorization: `Bearer ${tokenResponse.body.access_token}`,
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
                    });
                });
            });
        });

        it('Should return inactive for invalid token', () => {
            cy.login();
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
                    Authorization: `Bearer ldapp_invalid-token`,
                },
            }).then((response) => {
                expect(response.status).to.eq(200);
                expect(response.body).to.have.property('active', false);

                // OAuth2 endpoints should not have the {status, results} wrapper
                expect(response.body).to.not.have.property('status');
                expect(response.body).to.not.have.property('results');
            });
        });

        it('Should return error for introspect request without authentication', () => {
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
                failOnStatusCode: false,
            }).then((response) => {
                expect(response.status).to.eq(401);
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
                    redirect_uri: 'http://localhost:8100/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((getResponse) => {
                const html = getResponse.body;
                const extract = (name: string) => {
                    const match = new RegExp(
                        `<input[^>]+name=["']${name}["'][^>]+value=["']([^"']*)["']`,
                    ).exec(html);
                    return match ? match[1] : '';
                };
                const formData = {
                    response_type: extract('response_type'),
                    client_id: extract('client_id'),
                    redirect_uri: extract('redirect_uri'),
                    scope: extract('scope'),
                    state: extract('state'),
                    code_challenge: extract('code_challenge'),
                    code_challenge_method: extract('code_challenge_method'),
                    approve: 'true',
                };
                cy.request({
                    method: 'POST',
                    url: `${apiUrl}/authorize`,
                    form: true,
                    body: formData,
                    followRedirect: false,
                }).then((postResponse) => {
                    expect(postResponse.status).to.eq(200);
                    const location = extractRedirectUrlFromHtml(
                        postResponse.body,
                    );
                    const redirectUrl = new URL(location);
                    const code = redirectUrl.searchParams.get('code') || '';

                    expect(
                        code,
                        'Authorization code should not be empty',
                    ).to.not.eq('');
                    const tokenRequest: OAuthTokenRequest = {
                        grant_type: 'authorization_code',
                        code,
                        client_id: 'lightdash-cli',
                        client_secret: '',
                        redirect_uri: 'http://localhost:8100/callback',
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
                                expect(
                                    introspectResponse.body,
                                ).to.have.property('active', false);
                            });
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
                    redirect_uri: 'http://localhost:8100/callback',
                    scope: 'read write',
                    state: 'test-state',
                    code_challenge: PKCE_TEST_VALUES.codeChallenge,
                    code_challenge_method: 'S256',
                },
                followRedirect: false,
            }).then((getResponse) => {
                const html = getResponse.body;
                const extract = (name: string) => {
                    const match = new RegExp(
                        `<input[^>]+name=["']${name}["'][^>]+value=["']([^"']*)["']`,
                    ).exec(html);
                    return match ? match[1] : '';
                };
                const formData = {
                    response_type: extract('response_type'),
                    client_id: extract('client_id'),
                    redirect_uri: extract('redirect_uri'),
                    scope: extract('scope'),
                    state: extract('state'),
                    code_challenge: extract('code_challenge'),
                    code_challenge_method: extract('code_challenge_method'),
                    approve: 'true',
                };
                cy.request({
                    method: 'POST',
                    url: `${apiUrl}/authorize`,
                    form: true,
                    body: formData,
                    followRedirect: false,
                }).then((postResponse) => {
                    expect(postResponse.status).to.eq(200);
                    const location = extractRedirectUrlFromHtml(
                        postResponse.body,
                    );
                    const redirectUrl = new URL(location);
                    const code = redirectUrl.searchParams.get('code') || '';

                    expect(
                        code,
                        'Authorization code should not be empty',
                    ).to.not.eq('');
                    const tokenRequest: OAuthTokenRequest = {
                        grant_type: 'authorization_code',
                        code,
                        client_id: 'lightdash-cli',
                        client_secret: '',
                        redirect_uri: 'http://localhost:8100/callback',
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
                            expect(userResponse.body).to.have.property(
                                'results',
                            );
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
