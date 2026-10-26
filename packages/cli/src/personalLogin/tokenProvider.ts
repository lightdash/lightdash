import { AuthorizationError } from '@lightdash/common';
import Ajv from 'ajv';
import { randomUUID } from 'crypto';
import fetch from 'node-fetch';
import { canonicalInstanceUrl } from '../agentConnections/schema';
import { CLI_VERSION } from '../env';
import { type PersonalLogin } from './schema';
import { PersonalLoginStore, type LockedPersonalLoginStore } from './store';

export const freshLoginRequired =
    'Your CLI login needs a fresh `lightdash login`: the last token refresh did not complete.';
export const sessionExpired =
    'Your CLI session expired. Run `lightdash login` again.';
export const oauthHeaders = () => ({
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': `lightdash-cli/${CLI_VERSION}`,
    ...(process.env.LIGHTDASH_PROXY_AUTHORIZATION
        ? { 'Proxy-Authorization': process.env.LIGHTDASH_PROXY_AUTHORIZATION }
        : {}),
});
type TokenResponse = {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    session_expires_in?: number;
};
const seconds = { type: 'integer', minimum: 1, maximum: 2_147_483_647 };
const validateResponse = new Ajv().compile<TokenResponse>({
    type: 'object',
    required: [
        'access_token',
        'refresh_token',
        'token_type',
        'expires_in',
        'scope',
    ],
    properties: {
        access_token: { type: 'string', minLength: 1, maxLength: 16384 },
        refresh_token: { type: 'string', minLength: 1, maxLength: 16384 },
        token_type: { type: 'string', pattern: '^[Bb][Ee][Aa][Rr][Ee][Rr]$' },
        expires_in: seconds,
        session_expires_in: seconds,
        scope: { type: 'string', maxLength: 16384 },
    },
});
export const parseTokenResponse = (value: unknown): TokenResponse => {
    if (!validateResponse(value)) throw new Error(freshLoginRequired);
    const scopes = value.scope.split(' ');
    if (
        scopes.length !== 2 ||
        new Set(scopes).size !== 2 ||
        !scopes.includes('read') ||
        !scopes.includes('write')
    )
        throw new Error(freshLoginRequired);
    return value;
};
export const tokenExpiry = (
    response: TokenResponse,
    startedAt: number,
    dateHeader: string | null,
    deadline: number | null,
) => {
    const serverTime = dateHeader === null ? startedAt : Date.parse(dateHeader);
    if (!Number.isFinite(serverTime)) throw new Error(freshLoginRequired);
    const issuedAt = Math.min(startedAt, serverTime);
    const sessionExpiresAt = Math.min(
        deadline ?? Infinity,
        response.session_expires_in === undefined && deadline !== null
            ? deadline
            : issuedAt + (response.session_expires_in ?? 8 * 3600) * 1000,
    );
    const accessTokenExpiresAt = Math.min(
        issuedAt + response.expires_in * 1000,
        sessionExpiresAt,
    );
    if (Math.min(sessionExpiresAt, accessTokenExpiresAt) <= Date.now())
        throw new Error(sessionExpired);
    return {
        accessTokenIssuedAt: new Date(issuedAt).toISOString(),
        accessTokenExpiresAt: new Date(accessTokenExpiresAt).toISOString(),
        sessionExpiresAt: new Date(sessionExpiresAt).toISOString(),
    };
};

export class PersonalLoginTokenProvider {
    constructor(
        private readonly store: PersonalLoginStore = new PersonalLoginStore(),
    ) {}

    async getToken(
        instanceUrl: string,
        rejectedGeneration: number | null = null,
    ): Promise<PersonalLogin> {
        const instance = canonicalInstanceUrl(instanceUrl);
        return this.store.withLock(async (locked) => {
            let login = await locked.read(instance);
            if (login === null)
                throw new AuthorizationError(
                    "Not logged in. Run 'lightdash login --help'",
                );
            const requireLogin = async (
                current: PersonalLogin,
            ): Promise<never> => {
                await this.markLoginRequired(locked, instance, current);
                throw new Error(freshLoginRequired);
            };
            let journal;
            try {
                journal = await locked.readJournal(instance);
            } catch {
                return requireLogin(login);
            }
            if (journal !== null) {
                if (
                    login.refreshState.kind === 'idle' &&
                    journal.attemptUuid ===
                        login.tokens.lastRefreshAttemptUuid &&
                    journal.generation + 1 === login.tokens.generation
                )
                    await locked.clearJournal(instance);
                else return requireLogin(login);
            }
            if (login.refreshState.kind !== 'idle') return requireLogin(login);
            if (Date.parse(login.sessionExpiresAt) <= Date.now())
                throw new Error(sessionExpired);
            const remaining =
                Date.parse(login.tokens.accessTokenExpiresAt) - Date.now();
            const lifetime =
                Date.parse(login.tokens.accessTokenExpiresAt) -
                Date.parse(login.tokens.accessTokenIssuedAt);
            if (
                remaining > Math.min(60_000, lifetime / 10) &&
                rejectedGeneration !== login.tokens.generation
            )
                return login;
            const attemptUuid = randomUUID();
            const startedAt = Date.now();
            const pending: PersonalLogin = {
                ...login,
                refreshState: {
                    kind: 'in_progress',
                    attemptUuid,
                    startedAt: new Date(startedAt).toISOString(),
                },
            };
            await locked.writeJournal(instance, {
                attemptUuid,
                generation: login.tokens.generation,
            });
            await locked.save(instance, pending);
            try {
                const response = await fetch(`${instance}/api/v1/oauth/token`, {
                    method: 'POST',
                    headers: oauthHeaders(),
                    redirect: 'error',
                    signal: AbortSignal.timeout(15_000),
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        client_id: 'lightdash-cli',
                        refresh_token: login.tokens.refreshToken,
                        resource: instance,
                        scope: login.tokens.scopes.join(' '),
                    }),
                });
                if (!response.ok) throw new Error(freshLoginRequired);
                const value: unknown = await response.json();
                const token = parseTokenResponse(value);
                if (token.refresh_token === login.tokens.refreshToken)
                    throw new Error(freshLoginRequired);
                const expiry = tokenExpiry(
                    token,
                    startedAt,
                    response.headers.get('date'),
                    Date.parse(login.sessionExpiresAt),
                );
                login = {
                    ...login,
                    tokens: {
                        accessToken: token.access_token,
                        refreshToken: token.refresh_token,
                        accessTokenIssuedAt: expiry.accessTokenIssuedAt,
                        accessTokenExpiresAt: expiry.accessTokenExpiresAt,
                        scopes: token.scope.split(' '),
                        generation: login.tokens.generation + 1,
                        lastRefreshAttemptUuid: attemptUuid,
                    },
                    sessionExpiresAt: expiry.sessionExpiresAt,
                    refreshState: { kind: 'idle' },
                };
                await locked.save(instance, login);
            } catch {
                return requireLogin(pending);
            }
            await locked.clearJournal(instance);
            return login;
        });
    }

    private async markLoginRequired(
        locked: LockedPersonalLoginStore,
        instance: string,
        login: PersonalLogin,
    ): Promise<void> {
        await locked.save(instance, {
            ...login,
            refreshState: {
                kind: 'login_required',
                since: new Date().toISOString(),
            },
        });
    }
}
