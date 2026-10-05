import {
    AI_IDENTITY_PROVISIONER_WORST_CASE,
    AI_IDENTITY_SHOW_USERS_NOTICE,
    type AiIdentityProvisioningOperation,
    type UpdateAiIdentityAiRoleDefinition,
} from '../types/aiIdentityProvisioning';
import { ParameterError } from '../types/errors';

export const aiIdentitySnowflakeIdentifier = (value: string): string => {
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
        throw new ParameterError(
            'Snowflake names must use letters, digits, _ and $.',
        );
    }
    return value;
};
const identifier = aiIdentitySnowflakeIdentifier;

const key = (value: string): string => {
    if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length === 0) {
        throw new ParameterError('Invalid Snowflake public key.');
    }
    return value;
};

const string = (value: string): string =>
    `'${value.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;

export const renderProvisioningOperation = (
    op: AiIdentityProvisioningOperation,
    context: {
        mappedRoles: ReadonlySet<string>;
        lightdashCreatedUsers: ReadonlySet<string>;
    },
): string => {
    const userName = identifier(op.userName);
    const requireCreated = (): void => {
        if (!context.lightdashCreatedUsers.has(userName)) {
            throw new ParameterError('The user was not created by Lightdash.');
        }
    };
    const mappedRole = (role: string): string => {
        const checked = identifier(role);
        if (!context.mappedRoles.has(checked)) {
            throw new ParameterError('The role is not mapped to an AI role.');
        }
        return checked;
    };
    switch (op.kind) {
        case 'create_user':
            if (!userName.toUpperCase().endsWith('_AI')) {
                throw new ParameterError('AI user names must end in _AI.');
            }
            return `CREATE USER ${userName} TYPE = SERVICE_AGENT RSA_PUBLIC_KEY = ${string(key(op.publicKey))} DEFAULT_ROLE = ${mappedRole(op.defaultRole)} COMMENT = ${string(op.comment)};`;
        case 'set_public_key':
            requireCreated();
            return `ALTER USER ${userName} SET RSA_PUBLIC_KEY = ${string(key(op.publicKey))};`;
        case 'set_default_role':
            requireCreated();
            return `ALTER USER ${userName} SET DEFAULT_ROLE = ${mappedRole(op.role)};`;
        case 'grant_role':
            requireCreated();
            return `GRANT ROLE ${mappedRole(op.role)} TO USER ${userName};`;
        case 'revoke_role':
            requireCreated();
            return `REVOKE ROLE ${mappedRole(op.role)} FROM USER ${userName};`;
        case 'drop_user':
            requireCreated();
            return `DROP USER ${userName};`;
        default: {
            const unreachable: never = op;
            throw new ParameterError(
                `Unsupported provisioning operation: ${unreachable}`,
            );
        }
    }
};

export const buildAiIdentityProvisionerSetupSql = ({
    userName,
    roleName,
    publicKey,
    aiRoles,
    existingAiRoles,
}: {
    userName: string;
    roleName: string;
    publicKey: string;
    aiRoles: readonly UpdateAiIdentityAiRoleDefinition[];
    existingAiRoles?: readonly string[];
}): string => {
    const user = identifier(userName);
    const role = identifier(roleName);
    return [
        `-- ${AI_IDENTITY_PROVISIONER_WORST_CASE}`,
        `-- ${AI_IDENTITY_SHOW_USERS_NOTICE}`,
        '-- Run this as a role that can create roles and users, for example SECURITYADMIN, or ACCOUNTADMIN for the future grants.',
        `CREATE ROLE IF NOT EXISTS ${role};`,
        `GRANT CREATE USER ON ACCOUNT TO ROLE ${role};`,
        `CREATE USER IF NOT EXISTS ${user} TYPE = SERVICE RSA_PUBLIC_KEY = ${string(key(publicKey))} DEFAULT_ROLE = ${role};`,
        `ALTER USER ${user} SET RSA_PUBLIC_KEY = ${string(key(publicKey))} DEFAULT_ROLE = ${role};`,
        `GRANT ROLE ${role} TO USER ${user};`,
        ...aiRoles.flatMap((aiRole) => {
            const name = identifier(aiRole.roleName);
            if (aiRole.schemas.length === 0)
                return [
                    `-- Transfer the existing AI role ${name}.`,
                    `GRANT OWNERSHIP ON ROLE ${name} TO ROLE ${role} COPY CURRENT GRANTS;`,
                ];
            const warehouse = identifier(aiRole.warehouse);
            return [
                `-- Create ${name} with access only to its selected schemas.`,
                `CREATE ROLE IF NOT EXISTS ${name};`,
                `GRANT USAGE ON WAREHOUSE ${warehouse} TO ROLE ${name};`,
                ...aiRole.schemas.flatMap((schema) => {
                    const parts = schema.split('.');
                    if (parts.length !== 2)
                        throw new ParameterError(
                            'Schemas must use DATABASE.SCHEMA.',
                        );
                    const database = identifier(parts[0]);
                    const qualified = `${database}.${identifier(parts[1])}`;
                    return [
                        `GRANT USAGE ON DATABASE ${database} TO ROLE ${name};`,
                        `GRANT USAGE ON SCHEMA ${qualified} TO ROLE ${name};`,
                        `GRANT SELECT ON ALL TABLES IN SCHEMA ${qualified} TO ROLE ${name};`,
                        `GRANT SELECT ON ALL VIEWS IN SCHEMA ${qualified} TO ROLE ${name};`,
                        `GRANT SELECT ON FUTURE TABLES IN SCHEMA ${qualified} TO ROLE ${name};`,
                        `GRANT SELECT ON FUTURE VIEWS IN SCHEMA ${qualified} TO ROLE ${name};`,
                    ];
                }),
                `GRANT OWNERSHIP ON ROLE ${name} TO ROLE ${role} COPY CURRENT GRANTS;`,
            ];
        }),
        ...[...new Set(existingAiRoles ?? [])]
            .filter(
                (name) =>
                    !aiRoles.some(
                        (defined) =>
                            defined.roleName.toUpperCase() ===
                            name.toUpperCase(),
                    ),
            )
            .map(
                (name) =>
                    `GRANT OWNERSHIP ON ROLE ${identifier(name)} TO ROLE ${role} COPY CURRENT GRANTS;`,
            ),
        `-- New AI roles added later need the same GRANT OWNERSHIP to ${role}.`,
    ].join('\n');
};
