import {
    AiIdentityFailureReason,
    AiIdentityFailureSeverity,
} from '../types/aiIdentity';

const assertUnreachable = (value: never): never => {
    throw new Error(`Unexpected AI identity failure reason: ${value}`);
};

export const classifyAiIdentityFailure = (
    message: string,
): AiIdentityFailureReason => {
    if (/signed in as/i.test(message))
        return AiIdentityFailureReason.WRONG_USER;
    if (
        /not mark(?:ed)? this session as an agent session|not marked as an agent session|IS_AGENT_ACTIVATED.*false/i.test(
            message,
        )
    )
        return AiIdentityFailureReason.NOT_SERVICE_AGENT;
    if (/JWT token is invalid/i.test(message))
        return AiIdentityFailureReason.KEY_OR_USER_REJECTED;
    if (
        /Failed to select Snowflake warehouse|No active warehouse/i.test(
            message,
        )
    )
        return AiIdentityFailureReason.WAREHOUSE_ACCESS;
    if (/locked|disabled/i.test(message))
        return AiIdentityFailureReason.DISABLED_OR_LOCKED;
    if (/not allowed to access Snowflake|\bIP\b/i.test(message))
        return AiIdentityFailureReason.NETWORK_POLICY;
    return AiIdentityFailureReason.UNKNOWN;
};

export const getAiIdentityFailureGroupCopy = (
    reason: AiIdentityFailureReason,
): {
    title: string;
    explanation: string;
    fix: string;
    severity: AiIdentityFailureSeverity;
} => {
    switch (reason) {
        case AiIdentityFailureReason.KEY_OR_USER_REJECTED:
            return {
                title: 'Snowflake rejected the AI identity',
                explanation:
                    'The Snowflake user may be missing or its public key may not be set.',
                fix: 'Create the user and set its public key.',
                severity: AiIdentityFailureSeverity.AVAILABILITY,
            };
        case AiIdentityFailureReason.NOT_SERVICE_AGENT:
            return {
                title: 'Not a service agent user',
                explanation: 'The Snowflake user is not a service agent.',
                fix: 'Set the user type to SERVICE_AGENT.',
                severity: AiIdentityFailureSeverity.SECURITY,
            };
        case AiIdentityFailureReason.WRONG_USER:
            return {
                title: 'Wrong Snowflake user',
                explanation: 'Snowflake signed in as a different user.',
                fix: 'Check the AI identity name and credentials.',
                severity: AiIdentityFailureSeverity.SECURITY,
            };
        case AiIdentityFailureReason.WAREHOUSE_ACCESS:
            return {
                title: 'Warehouse access',
                explanation: 'The AI identity cannot use the warehouse.',
                fix: 'Grant warehouse usage to its role.',
                severity: AiIdentityFailureSeverity.AVAILABILITY,
            };
        case AiIdentityFailureReason.DISABLED_OR_LOCKED:
            return {
                title: 'Disabled or locked',
                explanation: 'Snowflake has disabled or locked the user.',
                fix: 'Enable and unlock the user.',
                severity: AiIdentityFailureSeverity.AVAILABILITY,
            };
        case AiIdentityFailureReason.NETWORK_POLICY:
            return {
                title: 'Network policy',
                explanation: 'A network policy blocks the sign-in.',
                fix: 'Allow the server IP addresses in Snowflake.',
                severity: AiIdentityFailureSeverity.AVAILABILITY,
            };
        case AiIdentityFailureReason.UNKNOWN:
            return {
                title: 'Other failure',
                explanation: 'The check failed for another reason.',
                fix: 'Review the Snowflake error.',
                severity: AiIdentityFailureSeverity.AVAILABILITY,
            };
        default:
            return assertUnreachable(reason);
    }
};

const quoteIdentifier = (value: string): string =>
    /^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)
        ? value
        : `"${value.replace(/"/g, '""')}"`;

export const buildAiIdentityFixSql = ({
    reason,
    twinName,
    publicKey,
    roleForTwin,
    warehouse,
}: {
    reason: AiIdentityFailureReason;
    twinName: string | null;
    publicKey: string | null;
    roleForTwin: string | null;
    warehouse: string | null;
}): string | null => {
    if (twinName === null) return null;
    const user = quoteIdentifier(twinName);
    switch (reason) {
        case AiIdentityFailureReason.KEY_OR_USER_REJECTED:
            return publicKey === null
                ? null
                : [
                      `CREATE USER IF NOT EXISTS ${user} TYPE = SERVICE_AGENT RSA_PUBLIC_KEY = '${publicKey.replace(/'/g, "''")}'${roleForTwin === null ? '' : ` DEFAULT_ROLE = ${quoteIdentifier(roleForTwin)}`};`,
                      `ALTER USER ${user} SET RSA_PUBLIC_KEY = '${publicKey.replace(/'/g, "''")}';`,
                      ...(roleForTwin === null
                          ? []
                          : [
                                `ALTER USER ${user} SET DEFAULT_ROLE = ${quoteIdentifier(roleForTwin)};`,
                                `GRANT ROLE ${quoteIdentifier(roleForTwin)} TO USER ${user};`,
                            ]),
                  ].join('\n');
        case AiIdentityFailureReason.NOT_SERVICE_AGENT:
            return `ALTER USER ${user} SET TYPE = SERVICE_AGENT;`;
        case AiIdentityFailureReason.DISABLED_OR_LOCKED:
            return `ALTER USER ${user} SET DISABLED = FALSE;\nALTER USER ${user} UNSET MINS_TO_UNLOCK;`;
        case AiIdentityFailureReason.WAREHOUSE_ACCESS:
            if (warehouse === null)
                return '-- Select a warehouse in the connection before granting warehouse usage.';
            return roleForTwin === null
                ? `-- Replace AI_ROLE with the role your automation grants to this AI identity.
-- GRANT USAGE ON WAREHOUSE ${quoteIdentifier(warehouse)} TO ROLE AI_ROLE;`
                : `GRANT USAGE ON WAREHOUSE ${quoteIdentifier(warehouse)} TO ROLE ${quoteIdentifier(roleForTwin)};`;
        case AiIdentityFailureReason.WRONG_USER:
        case AiIdentityFailureReason.NETWORK_POLICY:
        case AiIdentityFailureReason.UNKNOWN:
            return null;
        default:
            return assertUnreachable(reason);
    }
};
