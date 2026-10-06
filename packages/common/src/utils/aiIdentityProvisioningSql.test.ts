import { describe, expect, it } from 'vitest';
import { AI_IDENTITY_PROVISIONER_WORST_CASE } from '../types/aiIdentityProvisioning';
import {
    buildAiIdentityProvisionerCleanupSql,
    buildAiIdentityProvisionerSetupSql,
    buildAiIdentityRoleSchemaGrantSql,
    renderProvisioningOperation,
} from './aiIdentityProvisioningSql';
import { expandAiIdentitySchemaRule } from './aiIdentitySchemaRule';

const context = {
    mappedRoles: new Set(['ANALYST_AI']),
    lightdashCreatedUsers: new Set(['ALICE_AI']),
};

describe('renderProvisioningOperation', () => {
    it('writes only rules for mapped roles and calls the fixed procedure', () => {
        const sql = renderProvisioningOperation(
            {
                kind: 'write_rule',
                roleName: 'ANALYST_AI',
                warehouse: 'COMPUTE_WH',
                schemaRule: {
                    database: 'ANALYTICS',
                    excludePatterns: ['PII_*'],
                },
            },
            context,
        );
        expect(sql).toContain(
            'INSERT INTO LIGHTDASH_GOVERNANCE.AI_GRANTS.AI_GRANT_RULES',
        );
        expect(sql).toContain("AI_ROLE = ''ANALYST_AI''");
        expect(sql).toContain("'^PII_.*$'");
        expect(
            renderProvisioningOperation({ kind: 'sync_grants' }, context),
        ).toBe('CALL LIGHTDASH_GOVERNANCE.AI_GRANTS.SYNC_AI_GRANTS();');
    });

    it('rejects rule writes for unmapped roles and unsafe schema input', () => {
        expect(() =>
            renderProvisioningOperation(
                {
                    kind: 'write_rule',
                    roleName: 'OTHER',
                    warehouse: 'COMPUTE_WH',
                    schemaRule: {
                        database: 'ANALYTICS',
                        excludePatterns: [],
                    },
                },
                context,
            ),
        ).toThrow();
        expect(() =>
            renderProvisioningOperation(
                {
                    kind: 'write_rule',
                    roleName: 'ANALYST_AI',
                    warehouse: 'COMPUTE_WH',
                    schemaRule: {
                        database: 'ANALYTICS; DROP TABLE X',
                        excludePatterns: [],
                    },
                },
                context,
            ),
        ).toThrow();
    });

    it('disables only a mapped role in named databases', () => {
        expect(
            renderProvisioningOperation(
                {
                    kind: 'disable_rule',
                    roleName: 'ANALYST_AI',
                    databases: ['ANALYTICS'],
                },
                context,
            ),
        ).toContain("DATABASE_NAME IN ('ANALYTICS')");
        expect(() =>
            renderProvisioningOperation(
                {
                    kind: 'disable_rule',
                    roleName: 'OTHER',
                    databases: ['ANALYTICS'],
                },
                context,
            ),
        ).toThrow();
        expect(() =>
            renderProvisioningOperation(
                {
                    kind: 'disable_rule',
                    roleName: 'ANALYST_AI',
                    databases: ['ANALYTICS; DROP ROLE X'],
                },
                context,
            ),
        ).toThrow();
    });

    it('creates only service-agent AI users with mapped roles', () => {
        expect(
            renderProvisioningOperation(
                {
                    kind: 'create_user',
                    userName: 'BOB_AI',
                    publicKey: 'YWJj',
                    defaultRole: 'ANALYST_AI',
                    comment: 'AI user',
                },
                context,
            ),
        ).toContain('TYPE = SERVICE_AGENT');
    });

    it('keeps a comment with a backslash and a quote inside its string literal', () => {
        const sql = renderProvisioningOperation(
            {
                kind: 'create_user',
                userName: 'BOB_AI',
                publicKey: 'YWJj',
                defaultRole: 'ANALYST_AI',
                comment: "x\\'; DROP USER ALICE_AI; --",
            },
            context,
        );
        expect(sql).toBe(
            "CREATE USER BOB_AI TYPE = SERVICE_AGENT RSA_PUBLIC_KEY = 'YWJj' DEFAULT_ROLE = ANALYST_AI COMMENT = 'x\\\\''; DROP USER ALICE_AI; --';",
        );
    });

    it.each(['BOB', 'BOB_AI;DROP_ROLE', 'BOB_AI"'])(
        'rejects unsafe create names: %s',
        (userName) => {
            expect(() =>
                renderProvisioningOperation(
                    {
                        kind: 'create_user',
                        userName,
                        publicKey: 'YWJj',
                        defaultRole: 'ANALYST_AI',
                        comment: '',
                    },
                    context,
                ),
            ).toThrow();
        },
    );

    it('rejects unmapped and injected roles', () => {
        for (const role of ['OTHER', 'ANALYST_AI; DROP ROLE X']) {
            expect(() =>
                renderProvisioningOperation(
                    { kind: 'grant_role', userName: 'ALICE_AI', role },
                    context,
                ),
            ).toThrow();
            expect(() =>
                renderProvisioningOperation(
                    { kind: 'revoke_role', userName: 'ALICE_AI', role },
                    context,
                ),
            ).toThrow();
        }
    });

    it('rejects changes to users Lightdash did not create', () => {
        expect(() =>
            renderProvisioningOperation(
                { kind: 'drop_user', userName: 'BOB_AI' },
                context,
            ),
        ).toThrow();
        expect(() =>
            renderProvisioningOperation(
                {
                    kind: 'set_public_key',
                    userName: 'BOB_AI',
                    publicKey: 'YWJj',
                },
                context,
            ),
        ).toThrow();
        expect(() =>
            renderProvisioningOperation(
                {
                    kind: 'set_default_role',
                    userName: 'BOB_AI',
                    role: 'ANALYST_AI',
                },
                context,
            ),
        ).toThrow();
    });
});

describe('buildAiIdentityProvisionerSetupSql', () => {
    it('grants only user creation and ownership of mapped AI roles', () => {
        const sql = buildAiIdentityProvisionerSetupSql({
            catalogLoaded: true,
            userName: 'LIGHTDASH_PROVISIONER',
            roleName: 'LIGHTDASH_PROVISIONER_ROLE',
            publicKey: 'YWJj',
            aiRoles: [
                {
                    roleName: 'ANALYST_AI',
                    warehouse: 'COMPUTE_WH',
                    schemaRule: {
                        database: 'ANALYTICS',
                        excludePatterns: [],
                    },
                    allowedSchemas: ['ANALYTICS.PUBLIC'],
                    excludedSchemas: [],
                },
            ],
        });
        expect(sql).toContain(
            'GRANT CREATE USER ON ACCOUNT TO ROLE LIGHTDASH_PROVISIONER_ROLE;',
        );
        expect(sql).toContain('TYPE = SERVICE');
        expect(sql).toContain(
            'GRANT OWNERSHIP ON ROLE ANALYST_AI TO ROLE LIGHTDASH_PROVISIONER_ROLE COPY CURRENT GRANTS;',
        );
        expect(sql).toContain(
            'GRANT SELECT ON FUTURE VIEWS IN SCHEMA ANALYTICS.PUBLIC TO ROLE ANALYST_AI;',
        );
        expect(sql).toContain(
            'GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE ANALYST_AI;',
        );
        expect(sql).toContain(
            'GRANT SELECT ON ALL TABLES IN SCHEMA ANALYTICS.PUBLIC TO ROLE ANALYST_AI;',
        );
        expect(sql).not.toContain('SENSITIVE');
        expect(sql).toContain(
            'Run this as a role that can create roles and users',
        );
        expect(sql).toContain('Like any Snowflake role');
        expect(sql).toContain(AI_IDENTITY_PROVISIONER_WORST_CASE);
        expect(sql).toContain('New AI roles added later');
    });
    it('removes the provisioner after giving ACCOUNTADMIN its role', () => {
        const sql = buildAiIdentityProvisionerCleanupSql({
            userName: 'PROVISIONER',
            roleName: 'PROVISIONER_ROLE',
            aiUserNames: ['PERSON_AI', 'EDITOR_AI', 'PERSON_AI'],
        });
        const statements = sql
            .split('\n')
            .filter((line) => !line.startsWith('--'));
        expect(statements).toEqual([
            'GRANT ROLE PROVISIONER_ROLE TO ROLE ACCOUNTADMIN;',
            'DROP USER IF EXISTS EDITOR_AI;',
            'DROP USER IF EXISTS PERSON_AI;',
            'DROP USER IF EXISTS PROVISIONER;',
            'DROP ROLE IF EXISTS PROVISIONER_ROLE;',
        ]);
    });

    it('refuses unsafe names in the cleanup script', () => {
        expect(() =>
            buildAiIdentityProvisionerCleanupSql({
                userName: 'PROVISIONER',
                roleName: 'PROVISIONER_ROLE',
                aiUserNames: ['X; DROP ROLE ACCOUNTADMIN'],
            }),
        ).toThrow();
    });
});

describe('schema rule grants', () => {
    const catalog = [
        'DB.PII',
        'DB.PUBLIC',
        'DB.SALES',
        'DB.sales_archive',
        'OTHER.SALES',
    ];
    const setup = (excludePatterns: string[]) => {
        const schemaRule = { database: 'db', excludePatterns };
        const expansion = expandAiIdentitySchemaRule(schemaRule, catalog);
        return {
            expansion,
            sql: buildAiIdentityProvisionerSetupSql({
                catalogLoaded: true,
                userName: 'PROVISIONER',
                roleName: 'PROVISIONER_ROLE',
                publicKey: 'YWJj',
                aiRoles: [
                    {
                        roleName: 'LD_ROLE',
                        warehouse: 'WH',
                        schemaRule,
                        allowedSchemas: expansion.allowed,
                        excludedSchemas: expansion.excluded,
                    },
                ],
            }),
        };
    };

    it('excludes several patterns without granting them or another database', () => {
        const { sql } = setup(['p?i', 'sales*']);
        expect(sql).toContain(
            '-- LD_ROLE: 1 schema allowed, 3 excluded by the rule.',
        );
        expect(sql).toContain(
            'GRANT USAGE ON SCHEMA DB.PUBLIC TO ROLE LD_ROLE;',
        );
        expect(sql).not.toContain('GRANT USAGE ON SCHEMA DB.PII');
        expect(sql).not.toContain('GRANT USAGE ON SCHEMA OTHER.SALES');
    });

    it('matches case insensitively and excludes all schemas with a wildcard', () => {
        expect(setup(['sales*']).expansion.excluded).toEqual([
            'DB.SALES',
            'DB.sales_archive',
        ]);
        expect(setup(['*']).sql).not.toContain('GRANT USAGE ON SCHEMA');
        expect(setup([]).expansion.allowed).toHaveLength(4);
    });

    it('renders fix grants once per database and checks identifiers', () => {
        const sql = buildAiIdentityRoleSchemaGrantSql('LD_ROLE', [
            'DB.PUBLIC',
            'DB.SALES',
        ]);
        expect(sql.match(/GRANT USAGE ON DATABASE DB/g)).toHaveLength(1);
        expect(sql).toContain(
            'GRANT SELECT ON FUTURE VIEWS IN SCHEMA DB.SALES TO ROLE LD_ROLE;',
        );
        expect(() =>
            buildAiIdentityRoleSchemaGrantSql('LD_ROLE', ['DB.BAD-NAME']),
        ).toThrow();
    });

    it('says when the catalog is not loaded for a pattern rule', () => {
        const sql = buildAiIdentityProvisionerSetupSql({
            catalogLoaded: false,
            userName: 'PROVISIONER',
            roleName: 'PROVISIONER_ROLE',
            publicKey: 'YWJj',
            aiRoles: [
                {
                    roleName: 'ANALYST_AI',
                    warehouse: 'COMPUTE_WH',
                    schemaRule: {
                        database: 'ANALYTICS',
                        excludePatterns: ['PII_*'],
                    },
                    allowedSchemas: [],
                    excludedSchemas: [],
                },
            ],
        });
        expect(sql).toContain('The schema catalog is not loaded');
        expect(sql).not.toContain('GRANT USAGE ON SCHEMA');
    });
});
