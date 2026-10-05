import { describe, expect, it } from 'vitest';
import {
    getAgenticEnvBlock,
    getAgenticIntegrationSql,
    getAgentMaskingSql,
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

    it('generates a read-only restricted scope and account policy', () => {
        const sql = getSessionCeilingSql({
            database: 'DATA',
            schema: 'SECURITY',
            blockedRoles: ['CUSTOM'],
        });
        expect(sql).toContain(
            'CREATE RESTRICTED SESSION SCOPE "DATA"."SECURITY"."LIGHTDASH_AI_RESTRICTED_SCOPE" AS $$',
        );
        expect(sql).toContain('- privileges: [data read]');
        expect(sql).toContain('account: [all]');
        expect(sql).not.toContain('program usage');
        expect(sql).toContain(
            'blocked_roles: [ACCOUNTADMIN, SECURITYADMIN, SYSADMIN, ORGADMIN, CUSTOM]',
        );
        expect(sql).toContain('allow_role_switching: false');
        expect(sql).toContain('blocked_secondary_roles: [ALL]');
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
