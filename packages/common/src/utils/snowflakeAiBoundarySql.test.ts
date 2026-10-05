import { describe, expect, it } from 'vitest';
import {
    getAgenticEnvBlock,
    getAgenticIntegrationSql,
    getAgentMaskingSql,
    getAiTwinSessionCeilingSql,
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

describe('AI twin session policy', () => {
    const options = { database: 'DATA', schema: 'SECURITY', blockedRoles: [] };
    it('attaches the policy only to named AI users, quotes names and deduplicates', () => {
        const sql = getAiTwinSessionCeilingSql({
            ...options,
            twinNames: ['ALICE_AI', 'B"OB_AI', 'ALICE_AI'],
        });
        expect(sql).toContain('CREATE RESTRICTED SESSION SCOPE');
        expect(sql).toContain('CREATE SESSION POLICY');
        expect(sql).toContain(
            'ALTER USER "ALICE_AI" SET SESSION POLICY "DATA"."SECURITY"."LIGHTDASH_AI_SESSION_POLICY";',
        );
        expect(sql).toContain('ALTER USER "B""OB_AI"');
        expect(sql.match(/ALTER USER/g)).toHaveLength(2);
        expect(sql).not.toContain('ALTER ACCOUNT');
    });
    it('handles no names and rejects invalid names', () => {
        expect(
            getAiTwinSessionCeilingSql({ ...options, twinNames: [] }),
        ).not.toContain('ALTER USER');
        expect(() =>
            getAiTwinSessionCeilingSql({
                ...options,
                twinNames: ['bad\nname'],
            }),
        ).toThrow();
    });
});
