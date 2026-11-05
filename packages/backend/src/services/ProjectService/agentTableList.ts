import {
    assertUnreachable,
    sensitiveCredentialsFieldNames,
    type AiExecutionPlan,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { createHash } from 'crypto';
import { type AgentTableListOwner } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';

export const getAgentTableListOwner = (
    aiPlan: AiExecutionPlan | null,
): AgentTableListOwner | null => {
    if (aiPlan === null || aiPlan.identity === 'marked_person') return null;
    switch (aiPlan.identity) {
        case 'connected_person':
            return {
                kind: 'agent_sign_in',
                userUuid: aiPlan.audit.personUuid,
                userWarehouseCredentialsUuid: aiPlan.identityUuid,
            };
        case 'ai_service_account':
            return {
                kind: 'ai_service_account',
                slotUuid: aiPlan.credentialUuid,
                identityUuid: aiPlan.identityUuid,
            };
        default:
            return assertUnreachable(aiPlan, 'Unknown AI execution identity');
    }
};

const excludedScopeFields = new Set<string>([
    ...sensitiveCredentialsFieldNames,
    'resultIdentityVersion',
]);

const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value instanceof Date) return value.toISOString();
    if (value !== null && typeof value === 'object')
        return Object.fromEntries(
            Object.keys(value)
                .filter(
                    (field) =>
                        (value as Record<string, unknown>)[field] !== undefined,
                )
                .sort()
                .map((field) => [
                    field,
                    canonicalize((value as Record<string, unknown>)[field]),
                ]),
        );
    return value;
};

export const getAgentTableListScopeFingerprint = ({
    warehouseConnectionUuid,
    credentials,
}: {
    warehouseConnectionUuid: string | null;
    credentials: CreateWarehouseCredentials;
}): string => {
    const connection = Object.fromEntries(
        Object.entries(credentials).filter(
            ([field]) => !excludedScopeFields.has(field),
        ),
    );
    return createHash('sha256')
        .update(
            JSON.stringify(
                canonicalize({
                    version: 1,
                    warehouseConnectionUuid,
                    connection,
                }),
            ),
        )
        .digest('hex');
};
