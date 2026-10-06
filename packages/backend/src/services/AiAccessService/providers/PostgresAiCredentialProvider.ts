import {
    AiAccessRefusalReason,
    AiAccessRefusedError,
    AiCredentialMethod,
    AiPrincipalFailureReason,
    AiPrincipalStatus,
    AiSetupScriptFormat,
    ParameterError,
    UnexpectedServerError,
    WarehouseTypes,
    type AiAssurance,
    type AiProbeResult,
    type AiSetupScript,
    type AiWarehouseCapabilities,
    type CreatePostgresCredentials,
} from '@lightdash/common';
import { PostgresWarehouseClient, SshTunnel } from '@lightdash/warehouses';
import { randomBytes } from 'node:crypto';
import {
    type AiCreatedSecret,
    type AiCredentialProvider,
    type AiMintArgs,
    type AiMintedCredentials,
    type AiSetupScriptArgs,
} from './AiCredentialProvider';

const quoteIdentifier = (value: string): string =>
    `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string): string =>
    `'${value.replaceAll("'", "''")}'`;

export class PostgresAiCredentialProvider implements AiCredentialProvider<CreatePostgresCredentials> {
    readonly warehouseType = WarehouseTypes.POSTGRES;

    capabilities(): AiWarehouseCapabilities {
        const available = {
            available: true as const,
            method: AiCredentialMethod.KEY,
        };
        return {
            warehouseType: this.warehouseType,
            principals: {
                person: {
                    available: false,
                    reason: 'Postgres has no agent-marked session. Use a group, twin or shared principal.',
                },
                twin: available,
                group: available,
                shared: available,
            },
            transports: {
                direct: { available: true },
                procedure: {
                    available: false,
                    reason: 'The definer-rights procedure transport for Postgres is coming soon.',
                },
            },
            setupFormat: AiSetupScriptFormat.SQL,
        };
    }

    async createSecret(): Promise<AiCreatedSecret> {
        return {
            secret: randomBytes(32).toString('base64url'),
            publicKey: null,
            publicKeyFingerprint: null,
        };
    }

    async missingPrerequisite(): Promise<null> {
        return null;
    }

    async mint({
        connection,
        principal,
    }: AiMintArgs<CreatePostgresCredentials>): Promise<
        AiMintedCredentials<CreatePostgresCredentials>
    > {
        if (principal.secret === null)
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.PRINCIPAL_PENDING,
            );
        return {
            credentials: {
                ...connection,
                user: principal.ref,
                password: principal.secret,
                requireUserCredentials: false,
            },
            assurances: [{ kind: 'current_user_is', expected: principal.ref }],
            expiresAt: null,
        };
    }

    async probe(
        credentials: CreatePostgresCredentials,
        assurances: AiAssurance[],
    ): Promise<AiProbeResult> {
        for (const assurance of assurances) {
            if (assurance.kind !== 'current_user_is')
                throw new UnexpectedServerError(
                    'Postgres cannot verify this AI principal assurance.',
                );
        }
        let observed: {
            session_user: string | null;
            current_user: string | null;
        };
        const tunnel = new SshTunnel(credentials);
        try {
            const tunneledCredentials = await tunnel.connect();
            const client = new PostgresWarehouseClient(tunneledCredentials);
            const { rows } = await client.runQuery(
                'SELECT session_user AS session_user, current_user AS current_user',
                {},
            );
            const row = rows[0];
            observed = {
                session_user:
                    typeof row?.session_user === 'string'
                        ? row.session_user
                        : null,
                current_user:
                    typeof row?.current_user === 'string'
                        ? row.current_user
                        : null,
            };
        } catch (error) {
            const warehouseMessage =
                error instanceof Error ? error.message : String(error);
            let reason = AiPrincipalFailureReason.UNKNOWN;
            let message = 'Postgres could not verify the AI principal.';
            if (
                /password authentication failed|role ".*" does not exist/i.test(
                    warehouseMessage,
                )
            ) {
                reason = AiPrincipalFailureReason.CREDENTIAL_REJECTED;
                message = 'Postgres rejected the AI principal credentials.';
            } else if (/is not permitted to log in/i.test(warehouseMessage)) {
                reason = AiPrincipalFailureReason.DISABLED_OR_LOCKED;
                message = 'The Postgres AI principal cannot log in.';
            } else if (/no pg_hba.conf entry/i.test(warehouseMessage)) {
                reason = AiPrincipalFailureReason.NETWORK_POLICY;
                message = 'Postgres network policy blocked the AI principal.';
            } else if (
                /permission denied for database/i.test(warehouseMessage)
            ) {
                reason = AiPrincipalFailureReason.WAREHOUSE_ACCESS;
                message =
                    'The Postgres AI principal cannot access the database.';
            }
            return {
                ok: false,
                checkedAt: new Date(),
                reason,
                transient: reason === AiPrincipalFailureReason.UNKNOWN,
                message,
                observed: { session_user: null, current_user: null },
            };
        } finally {
            await tunnel.disconnect();
        }
        for (const assurance of assurances) {
            if (
                assurance.kind === 'current_user_is' &&
                (observed.session_user !== assurance.expected ||
                    observed.current_user !== assurance.expected)
            ) {
                return {
                    ok: false,
                    checkedAt: new Date(),
                    reason: AiPrincipalFailureReason.WRONG_PRINCIPAL,
                    transient: false,
                    message: 'Postgres signed in as a different principal.',
                    observed,
                };
            }
        }
        return { ok: true, checkedAt: new Date(), observed };
    }

    setupScript({
        connection,
        principal,
    }: AiSetupScriptArgs<CreatePostgresCredentials>): AiSetupScript {
        if (principal === null) {
            throw new ParameterError(
                'This warehouse needs a principal to build the setup script.',
            );
        }
        const ref = quoteIdentifier(principal.ref);
        const schema = quoteIdentifier(connection.schema);
        const password = quoteLiteral(
            principal.status === AiPrincipalStatus.PENDING &&
                principal.lastProbe === null
                ? (principal.secret ??
                      '<generated when the principal is first used>')
                : '<held by this instance; regenerate the secret to see a new one>',
        );
        return {
            format: AiSetupScriptFormat.SQL,
            parts: [
                {
                    title: 'Create the AI principal role',
                    body: `-- Run as a superuser or a role with CREATEROLE. Lightdash holds this password; the role has no other sign-in.
CREATE ROLE ${ref} LOGIN NOINHERIT PASSWORD ${password};
GRANT CONNECT ON DATABASE ${quoteIdentifier(connection.dbname)} TO ${ref};`,
                },
                {
                    title: 'Grant the data this principal may read',
                    body: `GRANT USAGE ON SCHEMA ${schema} TO ${ref};
GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${ref};
ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT ON TABLES TO ${ref};
-- To keep protected columns away from AI, grant columns instead of the table:
-- REVOKE SELECT ON ${schema}."customers" FROM ${ref};
-- GRANT SELECT (customer_id, created_at) ON ${schema}."customers" TO ${ref};`,
                },
            ],
        };
    }
}
