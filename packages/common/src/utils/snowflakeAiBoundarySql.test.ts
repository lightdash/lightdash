import { describe, expect, it } from 'vitest';
import {
    getAgenticEnvBlock,
    getAgenticIntegrationSql,
    getAgentMaskingSql,
    getAiQueryProcedureSettingValue,
    getAiQueryProcedureSql,
    getSessionCeilingSql,
    quoteSnowflakeAiIdentifier,
    SNOWFLAKE_AI_STRING_MASK,
} from './snowflakeAiBoundarySql';

describe('Snowflake AI boundary SQL', () => {
    it('quotes names and rejects invalid names', () => {
        expect(quoteSnowflakeAiIdentifier('a"b')).toBe('"a""b"');
        expect(() => quoteSnowflakeAiIdentifier('')).toThrow();
        expect(() => quoteSnowflakeAiIdentifier('x\ny')).toThrow();
    });

    it('generates an agentic integration with escaped roles and redirect', () => {
        const sql = getAgenticIntegrationSql({
            integrationName: 'AI"TEST',
            redirectUri:
                'https://example.com/api/v1/oauth/redirect/snowflake-ai',
            preAuthorizedRoles: ['ANALYST', 'A"B'],
        });
        expect(sql).toContain('CREATE SECURITY INTEGRATION "AI""TEST"');
        expect(sql).toContain('IS_AGENTIC = TRUE');
        expect(sql).toContain(
            'PRE_AUTHORIZED_ROLES_LIST = ("ANALYST", "A""B")',
        );
        expect(sql).toContain("SYSTEM$SHOW_OAUTH_CLIENT_SECRETS('AI\"TEST')");
    });

    it('generates self hosted environment values', () => {
        const block = getAgenticEnvBlock({ account: 'org.account' });
        expect(block).toContain('SNOWFLAKE_AI_OAUTH_CLIENT_ID=<client id>');
        expect(block).toContain(
            'https://org.account.snowflakecomputing.com/oauth/token-request',
        );
        expect(block).toContain('SNOWFLAKE_AI_OAUTH_ACCOUNT=org.account');
        expect(() => getAgenticEnvBlock({ account: 'x/path' })).toThrow();
    });

    it('generates a masking policy for every required type', () => {
        const sql = getAgentMaskingSql({
            tagDatabase: 'DATA',
            tagSchema: 'SECURITY',
            protectedSchemas: [{ database: 'DATA', schema: 'PRIVATE' }],
        });
        for (const type of [
            'STRING',
            'NUMBER',
            'FLOAT',
            'DATE',
            'TIMESTAMP_NTZ',
            'TIMESTAMP_LTZ',
            'TIMESTAMP_TZ',
            'BOOLEAN',
            'VARIANT',
        ]) {
            expect(sql).toContain(`LIGHTDASH_AI_MASK_${type}`);
        }
        expect(sql).toContain(
            `THEN '${SNOWFLAKE_AI_STRING_MASK}' ELSE val END`,
        );
        expect(sql).toContain('THEN NULL ELSE val END');
        expect(sql).toContain('ALTER SCHEMA "DATA"."PRIVATE" SET TAG');
    });

    it('generates a restricted scope with warehouse use and an account policy', () => {
        const sql = getSessionCeilingSql({
            database: 'DATA',
            schema: 'SECURITY',
            blockedRoles: ['CUSTOM'],
        });
        expect(sql).toContain(
            'CREATE RESTRICTED SESSION SCOPE "DATA"."SECURITY"."LIGHTDASH_AI_RESTRICTED_SCOPE" AS $$',
        );
        expect(sql).toContain('- privileges: [data read, compute usage]');
        expect(sql).toContain('account: [all]');
        expect(sql).not.toContain('program usage');
        expect(sql).toContain(
            'blocked_roles: [ACCOUNTADMIN, SECURITYADMIN, SYSADMIN, ORGADMIN, CUSTOM]',
        );
        expect(sql).toContain('allow_role_switching: false');
        expect(sql).not.toContain('secondary_roles:');
        expect(sql).toContain('AGENT_RESTRICTED_SESSION_SCOPE');
        expect(sql).toContain('ALTER ACCOUNT SET SESSION POLICY');
        expect(
            getSessionCeilingSql({
                database: "A'B",
                schema: 'SECURITY',
                blockedRoles: [],
            }),
        ).toContain(
            'AGENT_RESTRICTED_SESSION_SCOPE = \'"A\'\'B"."SECURITY"."LIGHTDASH_AI_RESTRICTED_SCOPE"\'',
        );
        expect(() =>
            getSessionCeilingSql({
                database: 'DATA',
                schema: 'SECURITY',
                blockedRoles: ['BAD]role'],
            }),
        ).toThrow();
    });
});

describe('getAgenticIntegrationSql redirect URI scheme', () => {
    it('allows a non-TLS redirect only for http URIs', () => {
        expect(
            getAgenticIntegrationSql({
                integrationName: 'LIGHTDASH_AI',
                redirectUri:
                    'http://localhost:3000/api/v1/oauth/redirect/snowflake-ai',
                preAuthorizedRoles: ['ANALYST'],
            }),
        ).toContain('OAUTH_ALLOW_NON_TLS_REDIRECT_URI = TRUE');
        expect(
            getAgenticIntegrationSql({
                integrationName: 'LIGHTDASH_AI',
                redirectUri:
                    'https://lightdash.example.com/api/v1/oauth/redirect/snowflake-ai',
                preAuthorizedRoles: ['ANALYST'],
            }),
        ).not.toContain('OAUTH_ALLOW_NON_TLS_REDIRECT_URI');
    });
});

describe('AI query procedure SQL', () => {
    const options = {
        database: 'ANALYTICS',
        schema: 'AI_GOVERNANCE',
        name: 'RUN_SQL',
        ownerRole: 'OWNER',
        aiRoles: ['ANALYST', 'READER'],
        allowedSchemas: [
            { database: 'DATA', schema: 'PUBLIC' },
            { database: 'DATA', schema: 'REPORTS' },
        ],
    };

    it('generates the complete procedure and grants in order', () => {
        expect(getAiQueryProcedureSql(options)).toBe(`USE ROLE "OWNER";
CREATE PROCEDURE "ANALYTICS"."AI_GOVERNANCE"."RUN_SQL"(Q STRING)
RETURNS TABLE()
LANGUAGE SQL
EXECUTE AS RESTRICTED CALLER
AS
$$
DECLARE rs RESULTSET;
BEGIN
  rs := (EXECUTE IMMEDIATE :Q);
  RETURN TABLE(rs);
END;
$$;
GRANT CALLER DATA READ ON SCHEMA "DATA"."PUBLIC" TO ROLE "OWNER";
GRANT CALLER DATA READ ON SCHEMA "DATA"."REPORTS" TO ROLE "OWNER";
GRANT CALLER COMPUTE USAGE ON ACCOUNT TO ROLE "OWNER";
GRANT USAGE ON PROCEDURE "ANALYTICS"."AI_GOVERNANCE"."RUN_SQL"(STRING) TO ROLE "ANALYST";
GRANT USAGE ON PROCEDURE "ANALYTICS"."AI_GOVERNANCE"."RUN_SQL"(STRING) TO ROLE "READER";`);
        expect(getAiQueryProcedureSettingValue(options)).toBe(
            '"ANALYTICS"."AI_GOVERNANCE"."RUN_SQL"',
        );
    });

    it('quotes unusual identifiers in the procedure, setting and grants', () => {
        const odd = {
            ...options,
            database: 'Data base',
            schema: 'A.B',
            name: 'run"sql',
            ownerRole: 'own"er',
            aiRoles: ['ai"role'],
            allowedSchemas: [{ database: 'A.B', schema: 'a"b' }],
        };
        const setting = '"Data base"."A.B"."run""sql"';
        expect(getAiQueryProcedureSettingValue(odd)).toBe(setting);
        const sql = getAiQueryProcedureSql(odd);
        expect(sql).toContain(`CREATE PROCEDURE ${setting}(Q STRING)`);
        expect(sql).toContain('USE ROLE "own""er";');
        expect(sql).toContain(
            'GRANT CALLER DATA READ ON SCHEMA "A.B"."a""b" TO ROLE "own""er";',
        );
        expect(sql).toContain(
            `GRANT USAGE ON PROCEDURE ${setting}(STRING) TO ROLE "ai""role";`,
        );
    });

    it.each(['database', 'schema', 'name', 'ownerRole'] as const)(
        'rejects an empty %s',
        (field) => {
            expect(() =>
                getAiQueryProcedureSql({ ...options, [field]: '' }),
            ).toThrow('Enter a valid Snowflake name');
        },
    );

    it('rejects empty lists and invalid list members', () => {
        expect(() =>
            getAiQueryProcedureSql({ ...options, aiRoles: [] }),
        ).toThrow('Enter at least one AI role');
        expect(() =>
            getAiQueryProcedureSql({ ...options, allowedSchemas: [] }),
        ).toThrow('Enter at least one allowed schema');
        expect(() =>
            getAiQueryProcedureSql({ ...options, aiRoles: [''] }),
        ).toThrow('Enter a valid Snowflake name');
        expect(() =>
            getAiQueryProcedureSql({
                ...options,
                allowedSchemas: [{ database: 'DATA', schema: '' }],
            }),
        ).toThrow('Enter a valid Snowflake name');
        expect(() =>
            getAiQueryProcedureSettingValue({ ...options, name: '' }),
        ).toThrow('Enter a valid Snowflake name');
    });

    it('adds program usage to the allowed privileges YAML', () => {
        expect(
            getSessionCeilingSql({
                database: 'DATA',
                schema: 'SECURITY',
                blockedRoles: [],
                programUsageSchema: {
                    database: 'ANALYTICS',
                    schema: 'AI_GOVERNANCE',
                },
            }),
        ).toContain(
            '      account: [all]\n    - privileges: [program usage]\n      schemas: [ANALYTICS.AI_GOVERNANCE]\nrole_scopes:',
        );
    });

    it.each(['', 'A.B', 'a"b', 'a b', '1ABC', 'a\nb', 'x]'])(
        'rejects unsafe YAML names: %j',
        (name) => {
            for (const field of ['database', 'schema']) {
                expect(() =>
                    getSessionCeilingSql({
                        database: 'DATA',
                        schema: 'SECURITY',
                        blockedRoles: [],
                        programUsageSchema: {
                            database: 'DATA',
                            schema: 'SAFE',
                            [field]: name,
                        },
                    }),
                ).toThrow('Enter a valid Snowflake name');
            }
        },
    );
});
