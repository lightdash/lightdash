import {
    AI_IDENTITY_PROVISIONER_WORST_CASE,
    AI_IDENTITY_SHOW_USERS_NOTICE,
    type AiIdentityAiRoleDefinition,
    type AiIdentityProvisioningOperation,
} from '../types/aiIdentityProvisioning';
import { ParameterError } from '../types/errors';
import {
    AI_IDENTITY_GOVERNANCE_DATABASE,
    AI_IDENTITY_GOVERNANCE_SCHEMA,
    globToAiIdentityRegex,
} from './aiIdentityAutomaticSyncSql';
import { isValidSchemaPattern } from './aiIdentitySchemaRule';
import {
    aiIdentitySnowflakeIdentifier,
    aiIdentitySnowflakeString,
} from './aiIdentitySnowflakeSql';
import assertUnreachable from './assertUnreachable';

export { aiIdentitySnowflakeIdentifier } from './aiIdentitySnowflakeSql';
const identifier = aiIdentitySnowflakeIdentifier;

const key = (value: string): string => {
    if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length === 0) {
        throw new ParameterError('Invalid Snowflake public key.');
    }
    return value;
};

const string = aiIdentitySnowflakeString;

export const buildAiIdentityRoleSchemaGrantSql = (
    roleName: string,
    schemas: readonly string[],
): string => {
    const role = identifier(roleName);
    const databases = new Set<string>();
    return schemas
        .flatMap((schema) => {
            const parts = schema.split('.');
            if (parts.length !== 2)
                throw new ParameterError('Schemas must use DATABASE.SCHEMA.');
            const database = identifier(parts[0]);
            const qualified = `${database}.${identifier(parts[1])}`;
            const databaseGrant = databases.has(database.toUpperCase())
                ? []
                : [`GRANT USAGE ON DATABASE ${database} TO ROLE ${role};`];
            databases.add(database.toUpperCase());
            return [
                ...databaseGrant,
                `GRANT USAGE ON SCHEMA ${qualified} TO ROLE ${role};`,
                `GRANT SELECT ON ALL TABLES IN SCHEMA ${qualified} TO ROLE ${role};`,
                `GRANT SELECT ON ALL VIEWS IN SCHEMA ${qualified} TO ROLE ${role};`,
                `GRANT SELECT ON FUTURE TABLES IN SCHEMA ${qualified} TO ROLE ${role};`,
                `GRANT SELECT ON FUTURE VIEWS IN SCHEMA ${qualified} TO ROLE ${role};`,
            ];
        })
        .join('\n');
};

export const renderProvisioningOperation = (
    op: AiIdentityProvisioningOperation,
    context: {
        mappedRoles: ReadonlySet<string>;
        lightdashCreatedUsers: ReadonlySet<string>;
    },
): string => {
    const requireCreated = (userName: string): void => {
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
        case 'create_user': {
            const userName = identifier(op.userName);
            if (!userName.toUpperCase().endsWith('_AI')) {
                throw new ParameterError('AI user names must end in _AI.');
            }
            return `CREATE USER ${userName} TYPE = SERVICE_AGENT RSA_PUBLIC_KEY = ${string(key(op.publicKey))} DEFAULT_ROLE = ${mappedRole(op.defaultRole)} COMMENT = ${string(op.comment)};`;
        }
        case 'set_public_key': {
            const userName = identifier(op.userName);
            requireCreated(userName);
            return `ALTER USER ${userName} SET RSA_PUBLIC_KEY = ${string(key(op.publicKey))};`;
        }
        case 'set_default_role': {
            const userName = identifier(op.userName);
            requireCreated(userName);
            return `ALTER USER ${userName} SET DEFAULT_ROLE = ${mappedRole(op.role)};`;
        }
        case 'grant_role': {
            const userName = identifier(op.userName);
            requireCreated(userName);
            return `GRANT ROLE ${mappedRole(op.role)} TO USER ${userName};`;
        }
        case 'revoke_role': {
            const userName = identifier(op.userName);
            requireCreated(userName);
            return `REVOKE ROLE ${mappedRole(op.role)} FROM USER ${userName};`;
        }
        case 'drop_user': {
            const userName = identifier(op.userName);
            requireCreated(userName);
            return `DROP USER ${userName};`;
        }
        case 'write_rule': {
            const role = mappedRole(op.roleName);
            identifier(op.warehouse);
            const database = identifier(op.schemaRule.database).toUpperCase();
            if (
                op.schemaRule.excludePatterns.some(
                    (pattern) => !isValidSchemaPattern(pattern),
                )
            )
                throw new ParameterError('Invalid schema pattern.');
            const table = `${AI_IDENTITY_GOVERNANCE_DATABASE}.${AI_IDENTITY_GOVERNANCE_SCHEMA}.AI_GRANT_RULES`;
            const rows = (
                op.schemaRule.excludePatterns.length > 0
                    ? op.schemaRule.excludePatterns.map(globToAiIdentityRegex)
                    : ['^$']
            ).map(
                (pattern) =>
                    `(${string(database)}, ${string(role)}, 'EXCLUDE', ${string(pattern)}, 'SCHEMA')`,
            );
            return `EXECUTE IMMEDIATE ${string(`BEGIN DELETE FROM ${table} WHERE AI_ROLE = ${string(role)}; INSERT INTO ${table} (DATABASE_NAME, AI_ROLE, MODE, PATTERN_REGEX, FUTURE_MODE) VALUES ${rows.join(', ')}; END;`)};`;
        }
        case 'disable_rule': {
            const role = mappedRole(op.roleName);
            if (op.databases.length === 0)
                throw new ParameterError('A managed rule needs a database.');
            const databases = [...new Set(op.databases.map(identifier))];
            const table = `${AI_IDENTITY_GOVERNANCE_DATABASE}.${AI_IDENTITY_GOVERNANCE_SCHEMA}.AI_GRANT_RULES`;
            return `DELETE FROM ${table} WHERE AI_ROLE = ${string(role)} AND DATABASE_NAME IN (${databases.map(string).join(', ')});`;
        }
        case 'sync_grants':
            return `CALL ${AI_IDENTITY_GOVERNANCE_DATABASE}.${AI_IDENTITY_GOVERNANCE_SCHEMA}.SYNC_AI_GRANTS();`;
        default:
            return assertUnreachable(op, 'Unknown provisioning operation');
    }
};

export const buildAiIdentityProvisionerSetupSql = ({
    userName,
    roleName,
    publicKey,
    aiRoles,
    existingAiRoles,
    catalogLoaded,
}: {
    userName: string;
    roleName: string;
    publicKey: string;
    aiRoles: readonly (Pick<
        AiIdentityAiRoleDefinition,
        'roleName' | 'warehouse' | 'schemaRule'
    > & {
        allowedSchemas: string[];
        excludedSchemas: string[];
    })[];
    existingAiRoles?: readonly string[];
    catalogLoaded: boolean;
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
            const summary = `-- ${name}: ${aiRole.allowedSchemas.length} ${aiRole.allowedSchemas.length === 1 ? 'schema' : 'schemas'} allowed, ${aiRole.excludedSchemas.length} excluded by the rule.`;
            const warehouse = identifier(aiRole.warehouse);
            const catalogNote = !catalogLoaded
                ? [
                      '-- The schema catalog is not loaded, so this rule grants no schemas yet. Refresh the catalog and copy the script again.',
                  ]
                : [];
            return [
                summary,
                ...catalogNote,
                `-- Create ${name} with access only to its selected schemas.`,
                `CREATE ROLE IF NOT EXISTS ${name};`,
                `GRANT USAGE ON WAREHOUSE ${warehouse} TO ROLE ${name};`,
                buildAiIdentityRoleSchemaGrantSql(name, aiRole.allowedSchemas),
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

export const buildAiIdentityProvisionerCleanupSql = ({
    userName,
    roleName,
    aiUserNames,
}: {
    userName: string;
    roleName: string;
    aiUserNames: readonly string[];
}): string => {
    const user = identifier(userName);
    const role = identifier(roleName);
    return [
        '-- Removes the Lightdash provisioner and the AI identities that it created. Run this as ACCOUNTADMIN.',
        '-- The provisioner role owns these users, so ACCOUNTADMIN gets the role first. Without it, the DROP USER statements fail.',
        `GRANT ROLE ${role} TO ROLE ACCOUNTADMIN;`,
        ...[...new Set(aiUserNames.map((name) => identifier(name)))]
            .sort()
            .map((name) => `DROP USER IF EXISTS ${name};`),
        `DROP USER IF EXISTS ${user};`,
        `DROP ROLE IF EXISTS ${role};`,
        '-- The AI roles stay. When the provisioner role is dropped, ACCOUNTADMIN becomes their owner.',
    ].join('\n');
};
