import { AgentCapability } from '@lightdash/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

export type SlotKey = {
    instanceUrl: string;
    organizationUuid: string;
    personUuid: string;
    name: string;
};
export type AgentConnectionStatusReason =
    | 'invalid_grant'
    | 'not_supported'
    | 'revoked'
    | 'expired'
    | 'agent_identity_disabled'
    | 'project_access'
    | 'person_permission'
    | 'agent_policy';
export type AgentConnectionSlot = SlotKey & {
    clientId: 'lightdash-cli';
    resource: string;
    grantUuid: string;
    grantRevision: number | null;
    approvedAt: string;
    grantExpiresAt: string;
    tokens: {
        accessToken: string;
        accessTokenExpiresAt: string;
        refreshToken: string;
        refreshTokenExpiresAt: string | null;
        scopes: string[];
        generation: number;
        lastRefreshAttemptUuid: string | null;
    };
    lastReported: {
        checkedAt: string;
        limitsStatus: 'ok' | 'invalid';
        approvedProjects: {
            projectUuid: string;
            name: string | null;
            approvedCapabilities: AgentCapability[];
        }[];
        effectiveProjects: {
            projectUuid: string;
            capabilities: {
                capability: AgentCapability;
                allowed: boolean;
                reason: AgentConnectionStatusReason | null;
            }[];
        }[];
        status: 'active' | 'expired' | 'revoked';
        lastUsedAt: string | null;
        revokedAt: string | null;
    };
    refreshState:
        | { kind: 'idle' }
        | { kind: 'in_progress'; attemptUuid: string; startedAt: string }
        | { kind: 'reconnect_required'; since: string };
    revokeState:
        | { kind: 'none' }
        | { kind: 'unconfirmed'; attemptedAt: string };
};
export const invalidConnection = (): Error =>
    new Error(
        'Invalid agent connection data. Reconnect before using this slot.',
    );
export const canonicalInstanceUrl = (input: string): string => {
    try {
        const url = new URL(input);
        if (
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            (url.protocol !== 'https:' &&
                !(
                    url.protocol === 'http:' &&
                    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
                ))
        )
            throw invalidConnection();
        return url.href.replace(/\/+$/, '');
    } catch {
        throw invalidConnection();
    }
};
const text = { type: 'string', minLength: 1, maxLength: 16384 };
const uuid = { type: 'string', format: 'uuid' };
const date = {
    type: 'string',
    format: 'date-time',
    pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$',
};
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });
const object = (properties: Record<string, object>) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
});
const array = (items: object) => ({ type: 'array', items, uniqueItems: true });
const capability = { enum: Object.values(AgentCapability) };
const createSlotValidator = () => {
    const ajv = new Ajv();
    addFormats(ajv);
    return ajv.compile<AgentConnectionSlot>(
        object({
            instanceUrl: { ...text, maxLength: 2048 },
            organizationUuid: uuid,
            personUuid: uuid,
            name: {
                type: 'string',
                pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$',
            },
            clientId: { const: 'lightdash-cli' },
            resource: { ...text, maxLength: 2048 },
            grantUuid: uuid,
            grantRevision: nullable({ type: 'integer', minimum: 1 }),
            approvedAt: date,
            grantExpiresAt: date,
            tokens: object({
                accessToken: text,
                accessTokenExpiresAt: date,
                refreshToken: text,
                refreshTokenExpiresAt: nullable(date),
                scopes: {
                    ...array({
                        type: 'string',
                        maxLength: 256,
                        pattern: '^[\\x21\\x23-\\x5B\\x5D-\\x7E]+$',
                    }),
                    minItems: 1,
                },
                generation: {
                    type: 'integer',
                    minimum: 1,
                    maximum: Number.MAX_SAFE_INTEGER,
                },
                lastRefreshAttemptUuid: nullable(uuid),
            }),
            lastReported: object({
                checkedAt: date,
                limitsStatus: { enum: ['ok', 'invalid'] },
                approvedProjects: array(
                    object({
                        projectUuid: uuid,
                        name: nullable({ type: 'string' }),
                        approvedCapabilities: array(capability),
                    }),
                ),
                effectiveProjects: array(
                    object({
                        projectUuid: uuid,
                        capabilities: array(
                            object({
                                capability,
                                allowed: { type: 'boolean' },
                                reason: {
                                    enum: [
                                        null,
                                        'invalid_grant',
                                        'not_supported',
                                        'revoked',
                                        'expired',
                                        'agent_identity_disabled',
                                        'project_access',
                                        'person_permission',
                                        'agent_policy',
                                    ],
                                },
                            }),
                        ),
                    }),
                ),
                status: { enum: ['active', 'expired', 'revoked'] },
                lastUsedAt: nullable(date),
                revokedAt: nullable(date),
            }),
            refreshState: {
                oneOf: [
                    object({ kind: { const: 'idle' } }),
                    object({
                        kind: { const: 'in_progress' },
                        attemptUuid: uuid,
                        startedAt: date,
                    }),
                    object({
                        kind: { const: 'reconnect_required' },
                        since: date,
                    }),
                ],
            },
            revokeState: {
                oneOf: [
                    object({ kind: { const: 'none' } }),
                    object({
                        kind: { const: 'unconfirmed' },
                        attemptedAt: date,
                    }),
                ],
            },
        }),
    );
};
let validator: ReturnType<typeof createSlotValidator> | null = null;
export const slotValidator = (value: unknown): value is AgentConnectionSlot => {
    validator ??= createSlotValidator();
    return validator(value);
};
export const validateSlot = (
    value: unknown,
    key: SlotKey,
): AgentConnectionSlot => {
    if (!slotValidator(value)) throw invalidConnection();
    if (
        value.instanceUrl !== canonicalInstanceUrl(value.instanceUrl) ||
        value.resource !== value.instanceUrl ||
        value.instanceUrl !== key.instanceUrl ||
        value.organizationUuid !== key.organizationUuid ||
        value.personUuid !== key.personUuid ||
        value.name !== key.name ||
        Date.parse(value.approvedAt) >= Date.parse(value.grantExpiresAt) ||
        Date.parse(value.tokens.accessTokenExpiresAt) >
            Date.parse(value.grantExpiresAt) ||
        (value.tokens.refreshTokenExpiresAt !== null &&
            Date.parse(value.tokens.refreshTokenExpiresAt) >
                Date.parse(value.grantExpiresAt))
    )
        throw invalidConnection();
    const approved = new Map(
        value.lastReported.approvedProjects.map((p) => [
            p.projectUuid,
            p.approvedCapabilities,
        ]),
    );
    const effective = new Set(
        value.lastReported.effectiveProjects.map((p) => p.projectUuid),
    );
    if (
        approved.size !== value.lastReported.approvedProjects.length ||
        effective.size !== value.lastReported.effectiveProjects.length ||
        approved.size !== effective.size
    )
        throw invalidConnection();
    for (const project of value.lastReported.effectiveProjects) {
        const capabilities = approved.get(project.projectUuid);
        if (
            !capabilities ||
            new Set(project.capabilities.map((c) => c.capability)).size !==
                project.capabilities.length ||
            (value.lastReported.limitsStatus === 'ok' &&
                project.capabilities.length !== capabilities.length) ||
            (value.lastReported.limitsStatus === 'invalid' &&
                (capabilities.length !== 0 ||
                    project.capabilities.some(
                        (c) => c.allowed || c.reason !== 'invalid_grant',
                    ))) ||
            project.capabilities.some(
                (c) =>
                    (value.lastReported.limitsStatus === 'ok' &&
                        !capabilities.includes(c.capability)) ||
                    c.allowed !== (c.reason === null),
            )
        )
            throw invalidConnection();
    }
    let refreshState: AgentConnectionSlot['refreshState'];
    switch (value.refreshState.kind) {
        case 'in_progress':
            refreshState = {
                kind: value.refreshState.kind,
                attemptUuid: value.refreshState.attemptUuid,
                startedAt: value.refreshState.startedAt,
            };
            break;
        case 'reconnect_required':
            refreshState = {
                kind: value.refreshState.kind,
                since: value.refreshState.since,
            };
            break;
        default:
            refreshState = { kind: value.refreshState.kind };
    }
    return {
        instanceUrl: value.instanceUrl,
        organizationUuid: value.organizationUuid,
        personUuid: value.personUuid,
        name: value.name,
        clientId: value.clientId,
        resource: value.resource,
        grantUuid: value.grantUuid,
        grantRevision: value.grantRevision,
        approvedAt: value.approvedAt,
        grantExpiresAt: value.grantExpiresAt,
        tokens: {
            accessToken: value.tokens.accessToken,
            accessTokenExpiresAt: value.tokens.accessTokenExpiresAt,
            refreshToken: value.tokens.refreshToken,
            refreshTokenExpiresAt: value.tokens.refreshTokenExpiresAt,
            scopes: [...value.tokens.scopes],
            generation: value.tokens.generation,
            lastRefreshAttemptUuid: value.tokens.lastRefreshAttemptUuid,
        },
        lastReported: {
            checkedAt: value.lastReported.checkedAt,
            limitsStatus: value.lastReported.limitsStatus,
            approvedProjects: value.lastReported.approvedProjects.map(
                (project) => ({
                    projectUuid: project.projectUuid,
                    name: project.name,
                    approvedCapabilities: [...project.approvedCapabilities],
                }),
            ),
            effectiveProjects: value.lastReported.effectiveProjects.map(
                (project) => ({
                    projectUuid: project.projectUuid,
                    capabilities: project.capabilities.map((action) => ({
                        capability: action.capability,
                        allowed: action.allowed,
                        reason: action.reason,
                    })),
                }),
            ),
            status: value.lastReported.status,
            lastUsedAt: value.lastReported.lastUsedAt,
            revokedAt: value.lastReported.revokedAt,
        },
        refreshState,
        revokeState:
            value.revokeState.kind === 'unconfirmed'
                ? {
                      kind: value.revokeState.kind,
                      attemptedAt: value.revokeState.attemptedAt,
                  }
                : { kind: value.revokeState.kind },
    };
};
