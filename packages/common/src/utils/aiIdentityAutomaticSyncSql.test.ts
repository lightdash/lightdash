import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    buildAiIdentityAutomaticSyncSetupSql,
    globToAiIdentityRegex,
} from './aiIdentityAutomaticSyncSql';

const setup = () =>
    buildAiIdentityAutomaticSyncSetupSql({
        managedScope: [{ roleName: 'ANALYST_AI', database: 'DATA' }],
        provisionerRole: 'LIGHTDASH_PROVISIONER_ROLE',
        warehouse: 'COMPUTE_WH',
    });
const normalise = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('automatic grant sync setup', () => {
    it.each([
        ['PII_*', '^PII_.*$'],
        ['Q?', '^Q.$'],
        [
            'a.b+c^d$e(f)[g]{h}|i\\j',
            '^a\\.b\\+c\\^d\\$e\\(f\\)\\[g\\]\\{h\\}\\|i\\\\j$',
        ],
        ['*', '^.*$'],
    ])('converts anchored glob %s to regex', (glob, regex) => {
        expect(globToAiIdentityRegex(glob)).toBe(regex);
    });

    it('emits the live-tested procedure body after identifier substitution', () => {
        const fixture = readFileSync(
            new URL('./fixtures/aiIdentitySyncProcedure.sql', import.meta.url),
            'utf8',
        );
        const expected = fixture.replaceAll(
            'LD_AI_TEST_GRANTS_GOV.AI_GRANTS',
            'LIGHTDASH_GOVERNANCE.AI_GRANTS',
        );
        const generated = setup();
        const start = generated.indexOf(
            'CREATE OR REPLACE PROCEDURE LIGHTDASH_GOVERNANCE.AI_GRANTS.SYNC_AI_GRANTS()',
        );
        const end = generated.indexOf('$$;', start) + 3;
        expect(normalise(generated.slice(start, end))).toBe(
            normalise(expected),
        );
    });

    it('substitutes a custom governance namespace without changing the SQL body', () => {
        const fixture = readFileSync(
            new URL('./fixtures/aiIdentitySyncProcedure.sql', import.meta.url),
            'utf8',
        );
        const expected = fixture.replaceAll(
            'LD_AI_TEST_GRANTS_GOV.AI_GRANTS',
            'CUSTOM_GOV.CUSTOM_GRANTS',
        );
        const sql = buildAiIdentityAutomaticSyncSetupSql({
            managedScope: [],
            provisionerRole: 'PROVISIONER',
            warehouse: 'WH',
            grantorRole: 'GRANTOR',
            governanceDatabase: 'CUSTOM_GOV',
            governanceSchema: 'CUSTOM_GRANTS',
            schedule: '15 MINUTES',
        });
        const start = sql.indexOf(
            'CREATE OR REPLACE PROCEDURE CUSTOM_GOV.CUSTOM_GRANTS.SYNC_AI_GRANTS()',
        );
        const end = sql.indexOf('$$;', start) + 3;
        expect(normalise(sql.slice(start, end))).toBe(normalise(expected));
        expect(sql).toContain("SCHEDULE = '15 MINUTES'");
        expect(sql).toContain(
            'GRANT USAGE ON PROCEDURE CUSTOM_GOV.CUSTOM_GRANTS.SYNC_AI_GRANTS() TO ROLE PROVISIONER;',
        );
    });

    it('keeps the grantor as owner and grants the provisioner only the procedure watermark', () => {
        const sql = setup();
        expect(sql).toContain(
            "AI_GRANT_SCOPE (AI_ROLE, DATABASE_NAME) VALUES ('ANALYST_AI', 'DATA')",
        );
        expect(sql).toContain(
            'CREATE OR REPLACE PROCEDURE LIGHTDASH_GOVERNANCE.AI_GRANTS.SCHEMA_WATERMARK()',
        );
        expect(sql).toContain('INFORMATION_SCHEMA.SCHEMATA');
        expect(sql).toContain(
            'GRANT USAGE ON PROCEDURE LIGHTDASH_GOVERNANCE.AI_GRANTS.SCHEMA_WATERMARK() TO ROLE LIGHTDASH_PROVISIONER_ROLE;',
        );
        expect(sql).toContain("SCHEDULE = '10 MINUTES'");
        expect(sql).toContain('USER_TASK_TIMEOUT_MS = 3600000');
    });

    it('installs exclusion rules before the first scheduled sync', () => {
        const sql = buildAiIdentityAutomaticSyncSetupSql({
            managedScope: [{ roleName: 'ANALYST_AI', database: 'DATA' }],
            managedRules: [
                {
                    roleName: 'ANALYST_AI',
                    database: 'DATA',
                    excludePatterns: ['PII_*'],
                },
            ],
            provisionerRole: 'LIGHTDASH_PROVISIONER_ROLE',
            warehouse: 'COMPUTE_WH',
        });
        expect(sql).toContain(
            "VALUES ('DATA', 'ANALYST_AI', 'EXCLUDE', '^PII_.*$', 'SCHEMA')",
        );
        expect(
            sql.indexOf(
                'INSERT INTO LIGHTDASH_GOVERNANCE.AI_GRANTS.AI_GRANT_RULES',
            ),
        ).toBeLessThan(
            sql.indexOf(
                'ALTER TASK LIGHTDASH_GOVERNANCE.AI_GRANTS.SYNC_AI_GRANTS_TASK RESUME',
            ),
        );
        expect(sql).not.toContain('GRANT USAGE ON SCHEMA DATA.PII_');
    });

    it.each(['PUBLIC', 'SYSADMIN', 'GLOBALORGADMIN', 'LIGHTDASH_AI_GRANTOR'])(
        'rejects protected role %s',
        (roleName) => {
            expect(() =>
                buildAiIdentityAutomaticSyncSetupSql({
                    managedScope: [{ roleName, database: 'DATA' }],
                    provisionerRole: 'LIGHTDASH_PROVISIONER_ROLE',
                    warehouse: 'COMPUTE_WH',
                }),
            ).toThrow();
        },
    );
});
