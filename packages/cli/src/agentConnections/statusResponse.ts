import { assertUnreachable } from '@lightdash/common';
import {
    validateSlot,
    type AgentConnectionSlot,
    type AgentConnectionStatusReason,
} from './schema';

export class ConnectionMismatchError extends Error {
    constructor() {
        super('The server returned a different connection.');
    }
}
export const responseRecord = (value: unknown): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new Error('The server returned invalid connection data.');
    return Object.fromEntries(Object.entries(value));
};
export const publicTextIsSafe = (
    value: string,
    secrets: readonly (string | null | undefined)[],
): boolean => {
    const containsSecret = (text: string) =>
        secrets.some((secret) => secret && text.includes(secret));
    let decoded = value;
    for (let round = 0; round < 8; round += 1) {
        if (containsSecret(decoded)) return false;
        if (URL.canParse(decoded)) {
            const url = new URL(decoded);
            if (
                containsSecret(url.href) ||
                [...url.searchParams].some(
                    ([key, item]) =>
                        containsSecret(key) || containsSecret(item),
                )
            )
                return false;
        }
        const next = decoded.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) =>
            Buffer.from(encoded.replaceAll('%', ''), 'hex').toString('utf8'),
        );
        if (next === decoded) return true;
        decoded = next;
    }
    return false;
};
export const publicConnectionReport = (
    slot: AgentConnectionSlot,
    extraSecrets: readonly (string | null | undefined)[] = [],
): AgentConnectionSlot['lastReported'] => ({
    checkedAt: slot.lastReported.checkedAt,
    status: slot.lastReported.status,
    limitsStatus: slot.lastReported.limitsStatus,
    lastUsedAt: slot.lastReported.lastUsedAt,
    revokedAt: slot.lastReported.revokedAt,
    approvedProjects: slot.lastReported.approvedProjects.map((project) => ({
        projectUuid: project.projectUuid,
        name:
            project.name !== null &&
            !publicTextIsSafe(project.name, [
                slot.tokens.accessToken,
                slot.tokens.refreshToken,
                ...extraSecrets,
            ])
                ? null
                : project.name,
        approvedCapabilities: project.approvedCapabilities,
    })),
    effectiveProjects: slot.lastReported.effectiveProjects.map((project) => ({
        projectUuid: project.projectUuid,
        capabilities: project.capabilities.map((action) => ({
            capability: action.capability,
            allowed: action.allowed,
            reason: action.reason,
        })),
    })),
});
export const connectionResponse = (
    value: unknown,
    slot: AgentConnectionSlot,
    requireEffective: boolean,
    extraSecrets?: readonly (string | null | undefined)[],
): AgentConnectionSlot => {
    const envelope = responseRecord(value);
    if (envelope.status !== 'ok')
        throw new Error('The server returned invalid connection data.');
    const record = responseRecord(envelope.results);
    if (
        ['grantUuid', 'name', 'clientId', 'approvedAt', 'expiresAt'].some(
            (field) => typeof record[field] !== 'string',
        )
    )
        throw new Error('The server returned invalid connection data.');
    if (
        record.grantUuid !== slot.grantUuid ||
        record.name !== slot.name ||
        record.clientId !== slot.clientId ||
        record.approvedAt !== slot.approvedAt ||
        record.expiresAt !== slot.grantExpiresAt
    )
        throw new ConnectionMismatchError();
    const revokedProjects =
        !requireEffective && Array.isArray(record.approvedProjects)
            ? record.approvedProjects.map((entry: unknown) => {
                  const project = responseRecord(entry);
                  return {
                      projectUuid: project.projectUuid,
                      capabilities: Array.isArray(project.approvedCapabilities)
                          ? project.approvedCapabilities.map(
                                (capability: unknown) => ({
                                    capability,
                                    allowed: false,
                                    reason: 'revoked',
                                }),
                            )
                          : null,
                  };
              })
            : null;
    const checked = validateSlot(
        {
            ...slot,
            lastReported: {
                checkedAt: new Date().toISOString(),
                limitsStatus: record.limitsStatus,
                approvedProjects: record.approvedProjects,
                effectiveProjects: requireEffective
                    ? record.effectiveProjects
                    : revokedProjects,
                status: record.status,
                lastUsedAt: record.lastUsedAt,
                revokedAt: record.revokedAt,
            },
        },
        slot,
    );
    if (
        checked.lastReported.status === 'revoked' &&
        checked.lastReported.revokedAt === null
    )
        throw new Error('The server returned invalid revocation data.');
    if (
        extraSecrets === undefined &&
        checked.lastReported.approvedProjects.some(
            (project) =>
                project.name !== null &&
                [slot.tokens.accessToken, slot.tokens.refreshToken].some(
                    (secret) => project.name?.includes(secret),
                ),
        )
    )
        throw new Error('The server returned unsafe connection data.');
    return {
        ...checked,
        lastReported: publicConnectionReport(checked, extraSecrets),
    };
};
export const statusReasonMessage = (
    reason: AgentConnectionStatusReason | null,
): string | null => {
    switch (reason) {
        case null:
            return null;
        case 'invalid_grant':
            return 'Connection limits are invalid.';
        case 'not_supported':
            return 'This action is not available to agent connections.';
        case 'revoked':
            return 'This connection was revoked.';
        case 'expired':
            return 'This connection expired.';
        case 'agent_identity_disabled':
            return 'Agent identity is disabled.';
        case 'project_access':
            return 'You no longer have access to this project.';
        case 'person_permission':
            return 'Your role does not allow this action.';
        case 'agent_policy':
            return "Your organisation's agent permissions do not allow this action.";
        default:
            return assertUnreachable(
                reason,
                'Unknown connection status reason',
            );
    }
};
