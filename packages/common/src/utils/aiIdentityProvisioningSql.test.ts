import { describe, expect, it } from 'vitest';
import { AI_IDENTITY_PROVISIONER_WORST_CASE } from '../types/aiIdentityProvisioning';
import { AiIdentitySchemaRuleMode } from '../types/aiIdentitySchemaRule';
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
                        mode: AiIdentitySchemaRuleMode.LIST,
                        schemas: ['ANALYTICS.PUBLIC'],
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
    it('transfers an existing role without creating it or granting data access', () => {
        const sql = buildAiIdentityProvisionerSetupSql({
            catalogLoaded: true,
            userName: 'PROVISIONER',
            roleName: 'PROVISIONER_ROLE',
            publicKey: 'YWJj',
            aiRoles: [
                {
                    roleName: 'EXISTING_AI',
                    warehouse: '',
                    schemaRule: {
                        mode: AiIdentitySchemaRuleMode.EXISTING_ROLE,
                    },
                    allowedSchemas: [],
                    excludedSchemas: [],
                },
            ],
        });
        expect(sql).toContain(
            'GRANT OWNERSHIP ON ROLE EXISTING_AI TO ROLE PROVISIONER_ROLE COPY CURRENT GRANTS;',
        );
        expect(sql).not.toContain('CREATE ROLE IF NOT EXISTS EXISTING_AI');
        expect(sql).not.toContain('GRANT SELECT');
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
    const setup = (
        mode:
            | AiIdentitySchemaRuleMode.ALL_EXCEPT
            | AiIdentitySchemaRuleMode.ONLY_MATCHING,
        patterns: string[],
    ) => {
        const schemaRule = { mode, database: 'db', patterns };
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
        const { sql } = setup(AiIdentitySchemaRuleMode.ALL_EXCEPT, [
            'p?i',
            'sales*',
        ]);
        expect(sql).toContain(
            '-- LD_ROLE: 1 schema allowed, 3 excluded by the rule.',
        );
        expect(sql).toContain(
            'GRANT USAGE ON SCHEMA DB.PUBLIC TO ROLE LD_ROLE;',
        );
        expect(sql).not.toContain('GRANT USAGE ON SCHEMA DB.PII');
        expect(sql).not.toContain('GRANT USAGE ON SCHEMA OTHER.SALES');
    });

    it('matches case insensitively and emits no schema grants on no match', () => {
        const matched = setup(AiIdentitySchemaRuleMode.ONLY_MATCHING, [
            'sales*',
        ]);
        expect(matched.expansion.allowed).toEqual([
            'DB.SALES',
            'DB.sales_archive',
        ]);
        const empty = setup(AiIdentitySchemaRuleMode.ONLY_MATCHING, [
            'MISSING*',
        ]);
        expect(empty.sql).toContain(
            '-- LD_ROLE: 0 schemas allowed, 4 excluded by the rule.',
        );
        expect(empty.sql).not.toContain('GRANT USAGE ON SCHEMA');
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
                        mode: AiIdentitySchemaRuleMode.ALL_EXCEPT,
                        database: 'ANALYTICS',
                        patterns: ['PII_*'],
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
