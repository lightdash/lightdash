import { AuthorizationError } from '@lightdash/common';
import * as http from 'http';
import fetch from 'node-fetch';
import { generators } from 'openid-client';
import { URL } from 'url';
import GlobalState from '../../../globalState';
import { openBrowser } from '../../../handlers/login/oauth';

/**
 * Databricks OAuth tokens result
 */
export interface DatabricksOAuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number; // Unix timestamp in seconds
}

/**
 * Perform Databricks U2M OAuth flow
 * Opens browser for user authentication and exchanges authorization code for tokens
 * @param host Databricks workspace host
 * @param clientId OAuth client ID (defaults to 'databricks-cli')
 */
export const performDatabricksOAuthFlow = async (
    host: string,
    clientId: string,
    clientSecret: string | undefined,
): Promise<DatabricksOAuthTokens> => {
    // Create a promise that will be resolved when we get the authorization code
    let resolveAuth: (value: { code: string; state: string }) => void;
    let rejectAuth: (reason: Error) => void;
    const authPromise = new Promise<{ code: string; state: string }>(
        (resolve, reject) => {
            resolveAuth = resolve;
            rejectAuth = reject;
        },
    );
    let port = 0;

    // Generate PKCE values
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);
    const state = generators.state();

    // Create HTTP server to handle the callback at root path
    const server = http.createServer((req, res) => {
        const callbackUrl = new URL(req.url || '/', `http://localhost:${port}`);
        const code = callbackUrl.searchParams.get('code');
        const returnedState = callbackUrl.searchParams.get('state');
        const error = callbackUrl.searchParams.get('error');

        res.setHeader('Content-Type', 'text/html');

        if (error === 'access_denied') {
            rejectAuth(new AuthorizationError(`OAuth error: access denied`));
            res.writeHead(400);
            res.end(
                '<html><body><h1>Authentication Failed</h1><p>Access denied. You can close this window.</p></body></html>',
            );
            return;
        }
        if (error) {
            rejectAuth(new AuthorizationError(`OAuth error: ${error}`));
            res.writeHead(400);
            res.end(
                `<html><body><h1>Authentication Failed</h1><p>Error: ${error}</p></body></html>`,
            );
            return;
        }

        if (!code || !returnedState) {
            rejectAuth(
                new AuthorizationError('Missing authorization code or state'),
            );
            res.writeHead(400);
            res.end(
                '<html><body><h1>Authentication Failed</h1><p>Missing authorization code or state.</p></body></html>',
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
                '<html><body><h1>Authentication Failed</h1><p>Session expired or invalid. Please close this window and try again.</p></body></html>',
            );
            return;
        }

        // Success - resolve the promise
        resolveAuth({ code, state: returnedState });

        res.writeHead(200);
        res.end(
            '<html><body><h1>Authentication Successful</h1><p>You can close this window and return to the CLI.</p></body></html>',
        );
    });

    // Start the server on port 8020 (standard for Databricks CLI)
    const preferredPort = 8020;
    await new Promise<void>((resolve, reject) => {
        server.on('error', (err: NodeJS.ErrnoException) => {
            // perhaps 8020 port is busy, but we can't use a random port
            reject(err);
        });

        server.listen(preferredPort, () => {
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

    const redirectUri = `http://localhost:${port}`;
    GlobalState.debug(`> Starting CLI callback server on URI: ${redirectUri}`);

    try {
        // Build Databricks authorization URL
        const authUrl = new URL('/oidc/v1/authorize', `https://${host}`);
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'all-apis offline_access');
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');
        authUrl.searchParams.set('state', state);

        console.error(`\n🔐 Databricks Authentication`);
        console.error(`Opening browser for authentication...`);
        console.error(
            `If the browser doesn't open automatically, please visit:`,
        );
        console.error(`${authUrl.href}\n`);

        // Try to open the browser
        await openBrowser(authUrl.href);

        // Wait for the authorization code
        const { code } = await authPromise;

        GlobalState.debug(
            `> Got authorization code ${code.substring(0, 10)}...`,
        );

        // Exchange the authorization code for tokens
        const tokenUrl = new URL('/oidc/v1/token', `https://${host}`);

        // Build token request parameters
        const tokenParams: Record<string, string> = {
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        };

        // For confidential clients (custom OAuth apps), include client_secret
        if (clientSecret) {
            tokenParams.client_secret = clientSecret;
        }

        const tokenResponse = await fetch(tokenUrl.href, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams(tokenParams),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new AuthorizationError(
                `Token exchange failed: ${tokenResponse.status} ${errorText}`,
            );
        }

        const tokenData = (await tokenResponse.json()) as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
        };
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const expiresIn = tokenData.expires_in;

        if (!accessToken || !refreshToken) {
            throw new AuthorizationError(
                'No access token or refresh token received from Databricks',
            );
        }

        GlobalState.debug(
            `> OAuth access token: ${accessToken.substring(0, 10)}...`,
        );
        GlobalState.debug(
            `> OAuth refresh token: ${refreshToken.substring(0, 10)}...`,
        );

        // Calculate expiration timestamp (current time + expires_in)
        const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

        return {
            accessToken,
            refreshToken,
            expiresAt,
        };
    } finally {
        // Clean up the server
        server.close();
    }
};
