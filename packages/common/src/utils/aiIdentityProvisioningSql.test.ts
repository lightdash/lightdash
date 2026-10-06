import { describe, expect, it } from 'vitest';
import { AI_IDENTITY_PROVISIONER_WORST_CASE } from '../types/aiIdentityProvisioning';
import {
    buildAiIdentityProvisionerCleanupSql,
    buildAiIdentityProvisionerSetupSql,
    renderProvisioningOperation,
} from './aiIdentityProvisioningSql';

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
            userName: 'LIGHTDASH_PROVISIONER',
            roleName: 'LIGHTDASH_PROVISIONER_ROLE',
            publicKey: 'YWJj',
            aiRoles: [
                {
                    roleName: 'ANALYST_AI',
                    warehouse: 'COMPUTE_WH',
                    schemas: ['ANALYTICS.PUBLIC'],
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
            userName: 'PROVISIONER',
            roleName: 'PROVISIONER_ROLE',
            publicKey: 'YWJj',
            aiRoles: [{ roleName: 'EXISTING_AI', warehouse: '', schemas: [] }],
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
