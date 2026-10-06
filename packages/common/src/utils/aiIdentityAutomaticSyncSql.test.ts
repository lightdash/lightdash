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
        const expected = fixture
            .replaceAll(
                'LD_AI_TEST_GRANTS_GOV.AI_GRANTS',
                'CUSTOM_GOV.CUSTOM_GRANTS',
            )
            .replaceAll('LIGHTDASH_AI_GRANTOR', 'GRANTOR');
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

    it('emits the live-tested exposure check without a floor', () => {
        const fixture = readFileSync(
            new URL('./fixtures/aiIdentityExposureCheck.sql', import.meta.url),
            'utf8',
        );
        const generated = setup();
        const start = generated.indexOf(
            'CREATE OR REPLACE PROCEDURE LIGHTDASH_GOVERNANCE.AI_GRANTS.AI_EXPOSURE_CHECK()',
        );
        const end = generated.indexOf('$$;', start) + 3;
        expect(normalise(generated.slice(start, end))).toBe(normalise(fixture));
        expect(generated).toContain(
            'GRANT USAGE ON PROCEDURE LIGHTDASH_GOVERNANCE.AI_GRANTS.AI_EXPOSURE_CHECK() TO ROLE LIGHTDASH_PROVISIONER_ROLE;',
        );
        expect(generated).not.toContain('SCHEMA_WATERMARK');
        expect(generated).not.toMatch(
            /GRANT SELECT ON FUTURE VIEWS IN DATABASE/,
        );
    });

    it('creates the exposure check as the grantor and grants usage only to the provisioner', () => {
        const sql = buildAiIdentityAutomaticSyncSetupSql({
            managedScope: [{ roleName: 'ANALYST_AI', database: 'DATA' }],
            provisionerRole: 'PROVISIONER',
            warehouse: 'WH',
            grantorRole: 'custom_grantor',
            governanceDatabase: 'CUSTOM_GOV',
            governanceSchema: 'CUSTOM_GRANTS',
        });
        const start = sql.indexOf(
            'CREATE OR REPLACE PROCEDURE CUSTOM_GOV.CUSTOM_GRANTS.AI_EXPOSURE_CHECK()',
        );
        const body = sql.slice(start, sql.indexOf('$$;', start) + 3);
        const fixture = readFileSync(
            new URL('./fixtures/aiIdentityExposureCheck.sql', import.meta.url),
            'utf8',
        ).replaceAll(
            'LIGHTDASH_GOVERNANCE.AI_GRANTS',
            'CUSTOM_GOV.CUSTOM_GRANTS',
        );
        expect(normalise(body)).toBe(normalise(fixture));
        expect(body).toContain('EXECUTE AS OWNER');
        expect(
            sql
                .slice(0, start)
                .match(/USE ROLE [^;]+;/g)
                ?.at(-1),
        ).toBe('USE ROLE CUSTOM_GRANTOR;');
        expect(
            sql.match(
                /GRANT USAGE ON PROCEDURE [^;]*AI_EXPOSURE_CHECK\(\)[^;]*;/g,
            ),
        ).toEqual([
            'GRANT USAGE ON PROCEDURE CUSTOM_GOV.CUSTOM_GRANTS.AI_EXPOSURE_CHECK() TO ROLE PROVISIONER;',
        ]);
        expect(sql).not.toContain('AI_GRANT_FLOOR');
        expect(sql).not.toContain('SCHEMA_WATERMARK');
        expect(sql).not.toMatch(
            /GRANT .*FUTURE VIEWS IN DATABASE .* TO ROLE CUSTOM_GRANTOR/,
        );
        expect(sql).toContain(
            'REVOKE SELECT ON FUTURE VIEWS IN DATABASE DATA FROM ROLE CUSTOM_GRANTOR;',
        );
        expect(normalise(sql)).toContain(
            `AND "grantee_name" <> :ai AND "grantee_name" <> 'CUSTOM_GRANTOR' AND "grantee_name" NOT IN (SELECT ai_role FROM CUSTOM_GOV.CUSTOM_GRANTS.AI_GRANT_SCOPE)`,
        );
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
