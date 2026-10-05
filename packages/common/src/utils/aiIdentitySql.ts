import type { AiIdentity } from '../types/aiIdentity';

const quoteIdentifier = (value: string): string =>
    /^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)
        ? value
        : `"${value.replace(/"/g, '""')}"`;

const quoteString = (value: string): string => `'${value.replace(/'/g, "''")}'`;

export const buildAiTwinProvisioningSql = ({
    identities,
    roleForTwin,
}: {
    identities: AiIdentity[];
    roleForTwin: string | null;
}): string =>
    identities
        .flatMap((identity) => {
            if (identity.twinName === null) {
                return [`-- ${identity.email}: no Snowflake login yet`];
            }
            const user = quoteIdentifier(identity.twinName);
            const role =
                roleForTwin === null
                    ? '{role_without_pii}'
                    : quoteIdentifier(roleForTwin);
            return [
                `CREATE USER IF NOT EXISTS ${user} TYPE = SERVICE_AGENT RSA_PUBLIC_KEY = ${quoteString(identity.publicKey)} DEFAULT_ROLE = ${role} COMMENT = ${quoteString(`Lightdash AI user for ${identity.email}`)};`,
                `ALTER USER ${user} SET RSA_PUBLIC_KEY = ${quoteString(identity.publicKey)};`,
                `GRANT ROLE ${role} TO USER ${user};`,
            ];
        })
        .join('\n');
