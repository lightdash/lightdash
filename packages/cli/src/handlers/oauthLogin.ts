import {
    AuthorizationError,
    generateOAuthErrorResponse,
    generateOAuthSuccessResponse,
} from '@lightdash/common';
import * as http from 'http';
import fetch from 'node-fetch';
import { generators, Issuer } from 'openid-client';
import { URL } from 'url';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { openBrowser } from './login/oauth';
import { generatePersonalAccessToken } from './login/pat';

export const loginWithOauth = async (
    url: string,
): Promise<{ userUuid: string; organizationUuid: string; token: string }> => {
    // Create a promise that will be resolved when we get the authorization code
    let resolveAuth: (value: { code: string; state: string }) => void;
    let rejectAuth: (reason: Error) => void;
    const authPromise = new Promise<{ code: string; state: string }>(
        (resolve, reject) => {
            resolveAuth = resolve;
            rejectAuth = reject;
        },
    );
    let port = 0; // Port will be set by once the CLI callback server starts, using a random port number

    // Generate PKCE values using openid-client generators
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();

    // Create HTTP server to handle the callback
    const server = http.createServer((req, res) => {
        if (req.url?.startsWith('/callback')) {
            const callbackUrl = new URL(req.url, `http://localhost:${port}`);
            const code = callbackUrl.searchParams.get('code');
            const returnedState = callbackUrl.searchParams.get('state');
            const error = callbackUrl.searchParams.get('error');

            res.setHeader('Content-Type', 'text/html');

            if (error === 'access_denied') {
                rejectAuth(new AuthorizationError(`OAuth error: ${error}`));
                res.writeHead(400);
                res.end(
                    generateOAuthErrorResponse('Authentication Failed', [
                        `Access denied from the Lightdash page.`,
                    ]),
                );
                return;
            }
            if (error) {
                rejectAuth(new AuthorizationError(`OAuth error: ${error}`));
                res.writeHead(400);
                res.end(
                    generateOAuthErrorResponse('Authentication Failed', [
                        `Error: ${error}`,
                    ]),
                );
                return;
            }

            if (!code || !returnedState) {
                rejectAuth(
                    new AuthorizationError(
                        'Missing authorization code or state',
                    ),
                );
                res.writeHead(400);
                res.end(
                    generateOAuthErrorResponse('Authentication Failed', [
                        'Missing authorization code or state parameter.',
                    ]),
                );
                return;
            }

            if (returnedState !== state) {
                rejectAuth(
                    new AuthorizationError(
                        'Authentication session expired or invalid',
                    ),
                );
                res.writeHead(400);
                res.end(
                    generateOAuthErrorResponse(
                        'Authentication Failed',
                        [
                            'Your authentication session has expired or is invalid.',
                            'This can happen if you used an old link.',
                            'Please close this window and try logging in again.',
                        ],
                        'sessionExpired',
                    ),
                );
                return;
            }

            // Success - resolve the promise
            resolveAuth({ code, state: returnedState });

            res.writeHead(200);
            res.end(generateOAuthSuccessResponse());
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    // Start the server
    await new Promise<void>((resolve) => {
        server.listen(0, () => {
            const address = server.address();
            if (address === null)
                throw new Error('Failed to get server address');

            if (typeof address === 'object') {
                port = address.port;
            } else {
                port = parseInt(address.toString(), 10);
            }
            GlobalState.debug(
                `> OAuth callback server listening on port ${port}`,
            );

            resolve();
        });
    });
    const redirectUri = `http://localhost:${port}/callback`;
    GlobalState.debug(`> Starting CLI callback server on URI: ${redirectUri}`);
    // Create OAuth2 issuer and client using openid-client
    const issuerUrl = new URL('/api/v1/oauth', url).href;
    const issuer = new Issuer({
        issuer: issuerUrl,
        authorization_endpoint: new URL('/api/v1/oauth/authorize', url).href,
        token_endpoint: new URL('/api/v1/oauth/token', url).href,
    });

    const client = new issuer.Client({
        client_id: 'lightdash-cli',
        redirect_uris: [redirectUri],
        response_types: ['code'],
        token_endpoint_auth_method: 'none', // Public client (no client secret)
        id_token_signed_response_alg: 'none', // Disable ID token validation for OAuth2
    });

    try {
        // Generate the authorization URL using openid-client
        const authUrl = client.authorizationUrl({
            scope: 'read write',
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        });

        console.error(`\n${styles.title('🔐 OAuth Authentication')}`);
        console.error(`Opening browser for authentication...`);
        console.error(
            `If the browser doesn't open automatically, please visit:`,
        );
        console.error(`${styles.secondary(authUrl)}\n`);

        // Try to open the browser
        await openBrowser(authUrl);

        // Wait for the authorization code
        const { code } = await authPromise;

        GlobalState.debug(
            `> Got authorization code ${code.substring(0, 10)}...`,
        );

        GlobalState.debug(`> Getting token for authorization code`);

        // Exchange the authorization code for an access token manually (pure OAuth2)
        const tokenUrl = new URL('/api/v1/oauth/token', url);
        const tokenResponse = await fetch(tokenUrl.href, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                client_id: 'lightdash-cli',
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new AuthorizationError(
                `Token exchange failed: ${tokenResponse.status} ${errorText}`,
            );
        }
        const tokenData = await tokenResponse.json();
        const { access_token: accessToken } = tokenData;

        if (!accessToken) {
            throw new AuthorizationError(
                'No access token received from OAuth server',
            );
        }

        GlobalState.debug(
            `> OAuth access token: ${accessToken.substring(0, 10)}...`,
        );
        GlobalState.debug(`> Creating PAT for user`);

        // Generate a new PAT from this access token
        const pat = await generatePersonalAccessToken(
            {
                Authorization: `Bearer ${accessToken}`,
            },
            url,
            8,
        );
        GlobalState.debug(`> PAT: ${pat.substring(0, 10)}...`);

        // Get user information using the PAT
        const userInfoUrl = new URL('/api/v1/user', url);
        const userResponse = await fetch(userInfoUrl.href, {
            method: 'GET',
            headers: {
                Authorization: `ApiKey ${pat}`,
            },
        });

        if (!userResponse.ok) {
            throw new AuthorizationError(
                `Failed to get user info: ${userResponse.status}`,
            );
        }

        const userData = await userResponse.json();
        const { userUuid, organizationUuid, firstName, lastName, email } =
            userData.results;

        GlobalState.debug(
            `> Got user info for user ${firstName} ${lastName} (${email}): ${userUuid} in organization ${organizationUuid}`,
        );

        return {
            userUuid,
            organizationUuid,
            token: pat,
        };
    } finally {
        // Clean up the server
        server.close();
    }
};
