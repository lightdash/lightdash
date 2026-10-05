export const SNOWFLAKE_AI_STRING_MASK = '***MASKED***';

export const quoteSnowflakeAiIdentifier = (value: string): string => {
    if (
        !value.trim() ||
        value !== value.trim() ||
        /[\x00-\x1f\x7f]/.test(value)
    ) {
        throw new Error('Enter a valid Snowflake name');
    }
    return `"${value.replace(/"/g, '""')}"`;
};

const sqlString = (value: string): string => {
    if (/[\x00-\x1f\x7f]/.test(value)) {
        throw new Error('Invalid SQL string');
    }
    return `'${value.replace(/'/g, "''")}'`;
};

const qualified = (...parts: string[]) =>
    parts.map(quoteSnowflakeAiIdentifier).join('.');

export const getAgenticIntegrationSql = ({
    integrationName,
    redirectUri,
    preAuthorizedRoles,
}: {
    integrationName: string;
    redirectUri: string;
    preAuthorizedRoles: string[];
}): string => {
    const url = new URL(redirectUri);
    if (!['https:', 'http:'].includes(url.protocol))
        throw new Error('Invalid redirect URI');
    const name = quoteSnowflakeAiIdentifier(integrationName);
    const roles = preAuthorizedRoles.map(quoteSnowflakeAiIdentifier).join(', ');
    if (!roles) throw new Error('Enter at least one pre-authorized role');
    return `CREATE SECURITY INTEGRATION ${name}\nTYPE = OAUTH\nOAUTH_CLIENT = CUSTOM\nOAUTH_CLIENT_TYPE = 'CONFIDENTIAL'\nOAUTH_REDIRECT_URI = ${sqlString(redirectUri)}\nENABLED = TRUE\nOAUTH_ISSUE_REFRESH_TOKENS = TRUE\nOAUTH_REFRESH_TOKEN_VALIDITY = 7776000\nIS_AGENTIC = TRUE\nPRE_AUTHORIZED_ROLES_LIST = (${roles});\n\nSELECT SYSTEM$SHOW_OAUTH_CLIENT_SECRETS(${sqlString(integrationName)});`;
};

export const getAgenticEnvBlock = ({
    account,
}: {
    account: string;
}): string => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(account)) {
        throw new Error('Enter a valid Snowflake account');
    }
    return [
        'SNOWFLAKE_AI_OAUTH_CLIENT_ID=<client id>',
        'SNOWFLAKE_AI_OAUTH_CLIENT_SECRET=<client secret>',
        `SNOWFLAKE_AI_OAUTH_AUTHORIZATION_ENDPOINT=https://${account}.snowflakecomputing.com/oauth/authorize`,
        `SNOWFLAKE_AI_OAUTH_TOKEN_ENDPOINT=https://${account}.snowflakecomputing.com/oauth/token-request`,
        `SNOWFLAKE_AI_OAUTH_ACCOUNT=${account}`,
    ].join('\n');
};

export const getAgentMaskingSql = ({
    tagDatabase,
    tagSchema,
    protectedSchemas,
}: {
    tagDatabase: string;
    tagSchema: string;
    protectedSchemas: { database: string; schema: string }[];
}): string => {
    const tag = qualified(tagDatabase, tagSchema, 'LIGHTDASH_AI_PROTECTED');
    const types = [
        'STRING',
        'NUMBER',
        'FLOAT',
        'DATE',
        'TIMESTAMP_NTZ',
        'TIMESTAMP_LTZ',
        'TIMESTAMP_TZ',
        'BOOLEAN',
        'VARIANT',
    ] as const;
    const statements = [`CREATE TAG IF NOT EXISTS ${tag};`];
    for (const type of types) {
        const policy = qualified(
            tagDatabase,
            tagSchema,
            `LIGHTDASH_AI_MASK_${type}`,
        );
        const mask =
            type === 'STRING' ? sqlString(SNOWFLAKE_AI_STRING_MASK) : 'NULL';
        statements.push(
            `CREATE MASKING POLICY IF NOT EXISTS ${policy} AS (val ${type}) RETURNS ${type} -> CASE WHEN SYS_CONTEXT('SNOWFLAKE$CURRENT', 'IS_AGENT_ACTIVATED')::BOOLEAN THEN ${mask} ELSE val END;`,
        );
        statements.push(`ALTER TAG ${tag} SET MASKING POLICY ${policy};`);
    }
    for (const { database, schema } of protectedSchemas) {
        statements.push(
            `ALTER SCHEMA ${qualified(database, schema)} SET TAG ${tag} = 'protected';`,
        );
    }
    return statements.join('\n\n');
};

export const getSessionCeilingSql = ({
    database,
    schema,
    blockedRoles,
}: {
    database: string;
    schema: string;
    blockedRoles: string[];
}): string => {
    const scope = qualified(database, schema, 'LIGHTDASH_AI_RESTRICTED_SCOPE');
    const policy = qualified(database, schema, 'LIGHTDASH_AI_SESSION_POLICY');
    const roles = [
        ...new Set([
            'ACCOUNTADMIN',
            'SECURITYADMIN',
            'SYSADMIN',
            'ORGADMIN',
            ...blockedRoles,
        ]),
    ];
    roles.forEach((role) => {
        if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(role))
            throw new Error('Enter a valid Snowflake role');
    });
    const yaml = `privilege_scopes:\n  allowed_privileges:\n    - privileges: [data read]\n      account: [all]\nrole_scopes:\n  blocked_roles: [${roles.join(', ')}]\n  allow_role_switching: false\n  blocked_secondary_roles: [ALL]`;
    return `CREATE RESTRICTED SESSION SCOPE ${scope} AS $$\n${yaml}\n$$;\n\nCREATE SESSION POLICY ${policy} AGENT_RESTRICTED_SESSION_SCOPE = ${sqlString(scope)};\n\nALTER ACCOUNT SET SESSION POLICY ${policy};`;
};
