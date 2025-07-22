import { AuthorizationError, oauthPageStyles } from '@lightdash/common';
import { exec } from 'child_process';
import * as crypto from 'crypto';
import * as http from 'http';
import { createServer } from 'net';
import fetch from 'node-fetch';
import { URL } from 'url';
import { promisify } from 'util';
import GlobalState from '../globalState';
import * as styles from '../styles';
import { generatePersonalAccessToken } from './login/pat';

// Shared CSS styles for OAuth response pages - matching Lightdash login design

const execAsync = promisify(exec);

// PKCE helper functions
const generateCodeVerifier = (): string =>
    crypto.randomBytes(32).toString('base64url');

const generateCodeChallenge = (verifier: string): string =>
    crypto.createHash('sha256').update(verifier).digest('base64url');

// Helper function to find an available port
const findAvailablePort = async (
    startPort: number,
    endPort: number,
): Promise<number> => {
    const ports = Array.from(
        { length: endPort - startPort + 1 },
        (_, i) => startPort + i,
    );

    const checkPort = async (port: number): Promise<number | null> => {
        try {
            await new Promise<void>((resolve, reject) => {
                const server = createServer();
                server.listen(port, () => {
                    server.close();
                    resolve();
                });
                server.on('error', () => {
                    reject();
                });
            });
            return port;
        } catch {
            return null;
        }
    };

    const results = await Promise.all(ports.map(checkPort));
    const availablePort = results.find((port) => port !== null);

    if (availablePort === null || availablePort === undefined) {
        throw new Error('No available ports found');
    }

    return availablePort;
};

// Helper function to open browser
const openBrowser = async (url: string): Promise<void> => {
    try {
        const { platform } = process;

        if (platform === 'darwin') {
            await execAsync(`open "${url}"`);
        } else if (platform === 'win32') {
            await execAsync(`start "${url}"`);
        } else {
            await execAsync(`xdg-open "${url}"`);
        }
    } catch (error) {
        GlobalState.debug(`> Could not open browser automatically: ${error}`);
    }
};

export const loginWithOauth = async (
    url: string,
): Promise<{ userUuid: string; organizationUuid: string; token: string }> => {
    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('hex');

    // Find an available port
    const port = await findAvailablePort(8100, 8110);
    const redirectUri = `http://localhost:${port}/callback`;

    // Create a promise that will be resolved when we get the authorization code
    let resolveAuth: (value: { code: string; state: string }) => void;
    let rejectAuth: (reason: Error) => void;
    const authPromise = new Promise<{ code: string; state: string }>(
        (resolve, reject) => {
            resolveAuth = resolve;
            rejectAuth = reject;
        },
    );

    // Create HTTP server to handle the callback
    const server = http.createServer((req, res) => {
        if (req.url?.startsWith('/callback')) {
            const callbackUrl = new URL(req.url, `http://localhost:${port}`);
            const code = callbackUrl.searchParams.get('code');
            const returnedState = callbackUrl.searchParams.get('state');
            const error = callbackUrl.searchParams.get('error');

            if (error) {
                rejectAuth(new AuthorizationError(`OAuth error: ${error}`));
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`
                    <html>
                        <head>
                            <style>${oauthPageStyles}</style>
                        </head>
                        <body>
                            <div class="stack">
                                
                                <div class="container error">
                                    <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                        <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                    <h1>Authentication Failed</h1>
                                    <p>Error: ${error}</p>
                                    <p>You can close this window and try again.</p>
                                </div>
                            </div>
                        </body>
                    </html>
                `);
                return;
            }

            if (!code || !returnedState) {
                rejectAuth(
                    new AuthorizationError(
                        'Missing authorization code or state',
                    ),
                );
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`
                    <html>
                        <head>
                            <style>${oauthPageStyles}</style>
                        </head>
                        <body>
                            <div class="stack">
                               
                                <div class="container error">
                                    <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                        <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                    <h1>Authentication Failed</h1>
                                    <p>Missing authorization code or state parameter.</p>
                                    <p>You can close this window and try again.</p>
                                </div>
                            </div>
                        </body>
                    </html>
                `);
                return;
            }

            if (returnedState !== state) {
                rejectAuth(
                    new AuthorizationError(
                        'Authentication session expired or invalid',
                    ),
                );
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`
                    <html>
                        <head>
                            <style>${oauthPageStyles}</style>
                        </head>
                        <body>
                            <div class="stack">
                               
                                <div class="container error">
                                    <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                        <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                    <h1>Authentication Failed</h1>
                                    <p>Your authentication session has expired or is invalid.</p>
                                    <p>This can happen if you used an old link.</p>
                                    <p>Please close this window and try logging in again.</p>
                                </div>
                            </div>
                        </body>
                    </html>
                `);
                return;
            }

            // Success - resolve the promise
            resolveAuth({ code, state: returnedState });

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <html>
                    <head>
                        <style>${oauthPageStyles}</style>
                    </head>
                    <body>
                        <div class="stack">
                           
                            <div class="container success">
                                <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                                    <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                <h1>Authentication Successful!</h1>
                                <p>You have been successfully authenticated with Lightdash.</p>
                                <p>You can close this window and return to the CLI.</p>
                            </div>
                        </div>
                    </body>
                </html>
            `);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    });

    // Start the server
    await new Promise<void>((resolve) => {
        server.listen(port, () => {
            GlobalState.debug(
                `> OAuth callback server listening on port ${port}`,
            );
            resolve();
        });
    });

    try {
        // Construct the authorization URL
        const authUrl = new URL('/api/v1/oauth/authorize', url);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('client_id', 'lightdash-cli');
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('scope', 'read write');
        authUrl.searchParams.set('state', state);
        authUrl.searchParams.set('code_challenge', codeChallenge);
        authUrl.searchParams.set('code_challenge_method', 'S256');

        console.error(`\n${styles.title('🔐 OAuth Authentication')}`);
        console.error(`Opening browser for authentication...`);
        console.error(
            `If the browser doesn't open automatically, please visit:`,
        );
        console.error(`${styles.secondary(authUrl.href)}\n`);

        // Try to open the browser
        await openBrowser(authUrl.href);

        // Wait for the authorization code
        const { code } = await authPromise;

        GlobalState.debug(
            `> Got authorization code ${code.substring(0, 10)}...`,
        );

        GlobalState.debug(`> Getting token for authorization code `);

        // Exchange the authorization code for an access token
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
            `> Oauth access token: ${accessToken.substring(0, 10)}...`,
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

        // Get user information using the access token
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
