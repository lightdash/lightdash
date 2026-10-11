import { assertUnreachable } from '@lightdash/common';
import Ajv from 'ajv';
import { randomUUID } from 'crypto';
import { type Response } from 'node-fetch';
import { createAgentConnectionFetch } from './apiUrl';
import { validateSlot, type AgentConnectionSlot, type SlotKey } from './schema';
import { AgentConnectionStore, type LockedStore } from './store';

type TokenResponse = {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
};
const createResponseValidator = () =>
    new Ajv().compile<TokenResponse>({
        type: 'object',
        required: [
            'access_token',
            'refresh_token',
            'token_type',
            'expires_in',
            'scope',
        ],
        properties: {
            access_token: { type: 'string', minLength: 1 },
            refresh_token: { type: 'string', minLength: 1 },
            token_type: {
                type: 'string',
                pattern: '^[Bb][Ee][Aa][Rr][Ee][Rr]$',
            },
            expires_in: { type: 'integer', minimum: 1, maximum: 2_147_483_647 },
            scope: { type: 'string', minLength: 1 },
        },
    });
let responseValidator: ReturnType<typeof createResponseValidator> | null = null;
const validateResponse = (value: unknown): value is TokenResponse => {
    responseValidator ??= createResponseValidator();
    return responseValidator(value);
};
const record = (value: unknown): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('The server returned invalid connection data.');
    return Object.fromEntries(Object.entries(value));
};
const results = async (
    response: Response,
): Promise<Record<string, unknown>> => {
    if (!response.ok)
        throw new Error('The server rejected this connection credential.');
    const value: unknown = await response.json();
    const payload = record(value);
    if (payload.status !== 'ok')
        throw new Error('The server returned invalid connection data.');
    return record(payload.results);
};
const reconnectError = () =>
    new Error(
        'Reconnect before using this agent connection. Its refresh outcome is uncertain.',
    );

export const assertUsableSlot = (
    slot: AgentConnectionSlot,
    now: number,
): void => {
    if (
        Date.parse(slot.grantExpiresAt) <= now ||
        slot.lastReported.status === 'expired'
    )
        throw new Error(
            'This agent connection expired. Reconnect before using this slot.',
        );
    if (
        slot.lastReported.status === 'revoked' ||
        slot.lastReported.revokedAt !== null
    )
        throw new Error(
            'This agent connection was revoked. Reconnect before using this slot.',
        );
    if (slot.lastReported.limitsStatus !== 'ok')
        throw new Error(
            'This agent connection has invalid limits. Reconnect before using this slot.',
        );
    switch (slot.revokeState.kind) {
        case 'none':
            break;
        case 'unconfirmed':
            throw new Error(
                'Revocation of this agent connection is unconfirmed. Reconnect before using this slot.',
            );
        default:
            assertUnreachable(slot.revokeState, 'Unknown revoke state');
    }
    switch (slot.refreshState.kind) {
        case 'idle':
            break;
        case 'in_progress':
        case 'reconnect_required':
            throw reconnectError();
        default:
            assertUnreachable(slot.refreshState, 'Unknown refresh state');
    }
};

export class AgentTokenProvider {
    private readonly verified = new Set<string>();

    constructor(
        private readonly store: AgentConnectionStore = new AgentConnectionStore(),
    ) {}

    private async verify(
        slot: AgentConnectionSlot,
        proxyAuthorization: string | null,
    ): Promise<AgentConnectionSlot> {
        const fetch = createAgentConnectionFetch(slot.instanceUrl);
        const headers = {
            Authorization: `Bearer ${slot.tokens.accessToken}`,
            ...(proxyAuthorization === null
                ? {}
                : { 'Proxy-Authorization': proxyAuthorization }),
        };
        const user = await results(
            await fetch(`${slot.instanceUrl}/api/v1/user`, {
                headers,
                redirect: 'error',
                signal: AbortSignal.timeout(15_000),
            }),
        );
        if (
            user.userUuid !== slot.personUuid ||
            user.organizationUuid !== slot.organizationUuid
        )
            throw new Error(
                'Agent connection identity does not match the configured person and organisation.',
            );
        const status = await results(
            await fetch(
                `${slot.instanceUrl}/api/v2/user/agent-connections/${slot.grantUuid}/status`,
                {
                    headers,
                    redirect: 'error',
                    signal: AbortSignal.timeout(15_000),
                },
            ),
        );
        if (
            status.grantUuid !== slot.grantUuid ||
            status.clientId !== slot.clientId ||
            status.approvedAt !== slot.approvedAt ||
            status.expiresAt !== slot.grantExpiresAt
        )
            throw new Error(
                'Agent connection grant does not match the saved approval.',
            );
        const checked = validateSlot(
            {
                ...slot,
                lastReported: {
                    checkedAt: new Date().toISOString(),
                    limitsStatus: status.limitsStatus,
                    approvedProjects: status.approvedProjects,
                    effectiveProjects: status.effectiveProjects,
                    status: status.status,
                    lastUsedAt: status.lastUsedAt,
                    revokedAt: status.revokedAt,
                },
            },
            slot,
        );
        assertUsableSlot(checked, Date.now());
        return checked;
    }

    private async reconnect(
        locked: LockedStore,
        slot: AgentConnectionSlot,
    ): Promise<never> {
        try {
            await locked.saveSlot({
                ...slot,
                refreshState: {
                    kind: 'reconnect_required',
                    since: new Date().toISOString(),
                },
            });
        } catch {
            throw reconnectError();
        }
        throw reconnectError();
    }

    async getToken(
        key: SlotKey,
        rejectedGeneration: number | null = null,
        proxyAuthorization: string | null = null,
    ): Promise<AgentConnectionSlot> {
        return this.store.withLock(async (locked) => {
            let slot = await locked.readSlot(key);
            if (slot === null)
                throw new Error(
                    'Agent connection not found for this instance, person and organisation. Reconnect before using this slot.',
                );
            let journal;
            try {
                journal = await locked.readJournal(key);
            } catch {
                return this.reconnect(locked, slot);
            }
            if (journal !== null) {
                if (
                    journal.grantUuid === slot.grantUuid &&
                    slot.tokens.generation === journal.generation + 1 &&
                    slot.tokens.lastRefreshAttemptUuid ===
                        journal.attemptUuid &&
                    slot.refreshState.kind === 'idle'
                )
                    await locked.clearJournal(key);
                else return this.reconnect(locked, slot);
            }
            if (slot.refreshState.kind === 'in_progress')
                return this.reconnect(locked, slot);
            assertUsableSlot(slot, Date.now());
            const remaining =
                Date.parse(slot.tokens.accessTokenExpiresAt) - Date.now();
            const lifetime =
                Date.parse(slot.tokens.accessTokenExpiresAt) -
                Date.parse(slot.lastReported.checkedAt);
            const earlyWindow = Math.min(60_000, Math.max(0, lifetime / 10));
            const mustRefresh =
                remaining <= earlyWindow ||
                rejectedGeneration === slot.tokens.generation;
            if (mustRefresh) {
                if (
                    slot.tokens.refreshTokenExpiresAt !== null &&
                    Date.parse(slot.tokens.refreshTokenExpiresAt) <= Date.now()
                )
                    throw new Error(
                        'This agent connection refresh token expired. Reconnect before using this slot.',
                    );
                const attemptUuid = randomUUID();
                const startedAt = Date.now();
                const pending: AgentConnectionSlot = {
                    ...slot,
                    refreshState: {
                        kind: 'in_progress',
                        attemptUuid,
                        startedAt: new Date(startedAt).toISOString(),
                    },
                };
                try {
                    await locked.saveSlot(pending);
                    await locked.writeJournal(key, {
                        grantUuid: slot.grantUuid,
                        attemptUuid,
                        generation: slot.tokens.generation,
                    });
                    const body = new URLSearchParams({
                        grant_type: 'refresh_token',
                        client_id: 'lightdash-cli',
                        refresh_token: slot.tokens.refreshToken,
                        resource: slot.resource,
                        scope: slot.tokens.scopes.join(' '),
                    });
                    const fetch = createAgentConnectionFetch(slot.instanceUrl);
                    const response = await fetch(
                        `${slot.instanceUrl}/api/v1/oauth/token`,
                        {
                            method: 'POST',
                            body,
                            redirect: 'error',
                            signal: AbortSignal.timeout(15_000),
                            headers:
                                proxyAuthorization === null
                                    ? {}
                                    : {
                                          'Proxy-Authorization':
                                              proxyAuthorization,
                                      },
                        },
                    );
                    if (!response.ok) throw reconnectError();
                    const value: unknown = await response.json();
                    if (
                        !validateResponse(value) ||
                        value.refresh_token === slot.tokens.refreshToken
                    )
                        throw reconnectError();
                    const scopes = value.scope.split(' ');
                    const savedScopes = slot.tokens.scopes;
                    if (
                        scopes.length !== slot.tokens.scopes.length ||
                        new Set(scopes).size !== scopes.length ||
                        scopes.some((scope) => !savedScopes.includes(scope))
                    )
                        throw reconnectError();
                    const dateHeader = response.headers.get('date');
                    const serverTime =
                        dateHeader === null
                            ? startedAt
                            : Date.parse(dateHeader);
                    if (
                        !Number.isFinite(serverTime) ||
                        Math.max(Date.now(), serverTime) >=
                            Date.parse(slot.grantExpiresAt)
                    )
                        throw reconnectError();
                    const expiresAt = Math.min(
                        startedAt + value.expires_in * 1000,
                        serverTime + value.expires_in * 1000,
                        Date.parse(slot.grantExpiresAt),
                    );
                    if (expiresAt <= Date.now()) throw reconnectError();
                    slot = await this.verify(
                        {
                            ...slot,
                            tokens: {
                                ...slot.tokens,
                                accessToken: value.access_token,
                                refreshToken: value.refresh_token,
                                accessTokenExpiresAt: new Date(
                                    expiresAt,
                                ).toISOString(),
                                generation: slot.tokens.generation + 1,
                                lastRefreshAttemptUuid: attemptUuid,
                            },
                            refreshState: { kind: 'idle' },
                        },
                        proxyAuthorization,
                    );
                    await locked.saveSlot(slot);
                } catch {
                    return this.reconnect(locked, pending);
                }
                await locked.clearJournal(key);
            }
            const verificationKey = JSON.stringify([
                slot.instanceUrl,
                slot.organizationUuid,
                slot.personUuid,
                slot.grantUuid,
                slot.tokens.generation,
            ]);
            if (!mustRefresh && !this.verified.has(verificationKey)) {
                try {
                    slot = await this.verify(slot, proxyAuthorization);
                } catch {
                    throw new Error(
                        'The server could not verify this agent connection. Reconnect or check its status in the app.',
                    );
                }
            }
            this.verified.add(verificationKey);
            return slot;
        });
    }
    async getLifecycleToken(
        key: SlotKey,
        operation: import('./lifecycle').LifecycleOperation,
        rejectedGeneration: number | null,
        proxyAuthorization: string | null,
    ): Promise<AgentConnectionSlot> {
        const { revocationRecovery } = await import('./lifecycle');
        const slot = await this.store.readSlot(key);
        if (
            !slot ||
            slot.grantUuid !== operation.grantUuid ||
            slot.tokens.generation !== operation.generation
        )
            throw new Error(
                'The local connection changed. Run the command again.',
            );
        if (operation.kind === 'revoke') {
            if (
                Date.parse(slot.tokens.accessTokenExpiresAt) <= Date.now() ||
                Date.parse(slot.grantExpiresAt) <= Date.now()
            )
                throw new Error(revocationRecovery);
            return slot;
        }
        assertUsableSlot(slot, Date.now());
        if (
            Date.parse(slot.tokens.accessTokenExpiresAt) > Date.now() &&
            rejectedGeneration === null
        )
            return slot;
        return this.getToken(key, rejectedGeneration, proxyAuthorization);
    }
}
