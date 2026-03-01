import { AuthorizationError } from '@lightdash/common';
import { exchangeDatabricksAuthorizationCode } from '@lightdash/warehouses';
import * as http from 'http';
import { generators } from 'openid-client';
import ora from 'ora';
import { URL } from 'url';
import GlobalState from '../../../globalState';
import { openBrowser } from '../../../handlers/login/oauth';
import * as styles from '../../../styles';

/**
 * Default OAuth client ID for Databricks U2M authentication.
 * This matches the client ID used by dbt-databricks.
 */
export const DATABRICKS_DEFAULT_OAUTH_CLIENT_ID = 'dbt-databricks';

/**
 * Databricks OAuth tokens result
 */
export interface DatabricksOAuthTokens {
    accessToken: string;
    refreshToken: string;
    /** The client_id extracted from the Databricks JWT — the actual client used. */
    oauthClientId: string | undefined;
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

        // Pause any active spinner while authenticating
        const parentSpinner = GlobalState.getActiveSpinner();
        const wasSpinning = parentSpinner?.isSpinning;
        parentSpinner?.stop();

        const divider = styles.secondary(
            '─'.repeat(process.stdout.columns || 80),
        );
        console.error(`\n${divider}`);
        console.error(`${styles.title('🔐  Databricks Authentication')}`);

        // Try to open the browser
        await openBrowser(authUrl.href);

        // Show spinner with fallback URL — both disappear on success
        // Use ora directly to avoid overwriting the global active spinner
        const authSpinner = ora(
            `  Waiting for authentication in browser...\n` +
                `   If it doesn't open, visit: ${styles.secondary(authUrl.href)}`,
        ).start();

        // Wait for the authorization code
        let code: string;
        try {
            ({ code } = await authPromise);
            authSpinner.stop();
        } catch (e) {
            authSpinner.fail(`  Databricks authentication failed`);
            throw e;
        }

        GlobalState.debug(
            `> Got authorization code ${code.substring(0, 10)}...`,
        );

        // Exchange the authorization code for tokens (uses shared warehouses code)
        const { accessToken, refreshToken, jwtClientId } =
            await exchangeDatabricksAuthorizationCode(
                host,
                clientId,
                code,
                redirectUri,
                codeVerifier,
                clientSecret,
            );

        if (!accessToken) {
            throw new AuthorizationError(
                'No access token received from Databricks',
            );
        }

        if (!refreshToken) {
            throw new AuthorizationError(
                "Databricks did not return a refresh token. Ensure 'offline_access' scope is enabled for your OAuth app.",
            );
        }

        GlobalState.debug(
            `> OAuth access token: ${accessToken.substring(0, 10)}...`,
        );
        GlobalState.debug(
            `> OAuth refresh token: ${refreshToken.substring(0, 10)}...`,
        );

        console.error(
            `${styles.success('✔')}   Successfully authenticated with Databricks`,
        );
        console.error(`${divider}\n`);

        // Restart the parent spinner if it was active
        if (wasSpinning) {
            parentSpinner?.start();
        }

        return {
            accessToken,
            refreshToken,
            oauthClientId: jwtClientId,
        };
    } finally {
        // Clean up the server
        server.close();
    }
};
