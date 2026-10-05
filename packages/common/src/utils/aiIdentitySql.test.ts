import { describe, expect, it } from 'vitest';
import { AiIdentityState } from '../types/aiIdentity';
import { buildAiTwinProvisioningSql } from './aiIdentitySql';

describe('buildAiTwinProvisioningSql', () => {
    it('escapes identifiers and strings and updates an existing key', () => {
        const sql = buildAiTwinProvisioningSql({
            identities: [
                {
                    aiIdentityUuid: 'id',
                    aiIdentityAccountUuid: 'account',
                    snowflakeAccount: 'SNOWFLAKE',
                    userUuid: 'user',
                    email: "a'b@example.com",
                    firstName: 'A',
                    lastName: 'B',
                    snowflakeLogin: 'LOGIN',
                    twinNameOverride: null,
                    twinName: 'A"B',
                    publicKey: 'KEY',
                    publicKeyFingerprint: 'SHA256:KEY',
                    state: AiIdentityState.PENDING,
                    stale: false,
                    failureReason: null,
                    statusMessage: null,
                    checkedAt: null,
                    createdAt: new Date(),
                },
            ],
            roleForTwin: 'ROLE',
        });
        expect(sql).toContain(
            'CREATE USER IF NOT EXISTS "A""B" TYPE = SERVICE_AGENT',
        );
        expect(sql).toContain("Lightdash AI user for a''b@example.com");
        expect(sql).toContain(
            'ALTER USER "A""B" SET RSA_PUBLIC_KEY = \'KEY\';',
        );
        expect(sql).toContain('GRANT ROLE ROLE TO USER "A""B";');
    });

    it('leaves safe names unquoted so Snowflake stores them in upper case', () => {
        const sql = buildAiTwinProvisioningSql({
            identities: [
                {
                    aiIdentityUuid: 'id',
                    aiIdentityAccountUuid: 'account',
                    snowflakeAccount: 'SNOWFLAKE',
                    userUuid: 'user',
                    email: 'person@example.com',
                    firstName: 'A',
                    lastName: 'B',
                    snowflakeLogin: 'person',
                    twinNameOverride: null,
                    twinName: 'person_AI',
                    publicKey: 'KEY',
                    publicKeyFingerprint: 'SHA256:KEY',
                    state: AiIdentityState.PENDING,
                    stale: false,
                    failureReason: null,
                    statusMessage: null,
                    checkedAt: null,
                    createdAt: new Date(),
                },
            ],
            roleForTwin: 'analyst_no_pii',
        });
        expect(sql).toContain(
            'CREATE USER IF NOT EXISTS person_AI TYPE = SERVICE_AGENT',
        );
        expect(sql).toContain('GRANT ROLE analyst_no_pii TO USER person_AI;');
    });
});

const makeIdentity = (snowflakeLogin: string | null) => ({
    aiIdentityUuid: 'id',
    aiIdentityAccountUuid: 'account',
    snowflakeAccount: 'ACCOUNT',
    userUuid: 'user',
    email: 'person@example.com',
    firstName: 'Person',
    lastName: 'Example',
    snowflakeLogin,
    twinNameOverride: null,
    twinName: `${snowflakeLogin}_AI`,
    publicKey: 'KEY',
    publicKeyFingerprint: 'SHA256:KEY',
    state: AiIdentityState.PENDING,
    stale: false,
    failureReason: null,
    statusMessage: null,
    checkedAt: null,
    createdAt: new Date(),
});

it('expands each person’s role template independently', () => {
    const sql = buildAiTwinProvisioningSql({
        identities: [makeIdentity('FIRST'), makeIdentity('SECOND')],
        roleForTwin: '{snowflake_login}_AI_ROLE',
    });
    expect(sql).toContain('DEFAULT_ROLE = FIRST_AI_ROLE');
    expect(sql).toContain('GRANT ROLE FIRST_AI_ROLE TO USER FIRST_AI;');
    expect(sql).toContain('DEFAULT_ROLE = SECOND_AI_ROLE');
    expect(sql).toContain('GRANT ROLE SECOND_AI_ROLE TO USER SECOND_AI;');
    expect(sql).not.toContain('{snowflake_login}');
});

it('fills a role from an overridden AI identity name without a Snowflake login', () => {
    const sql = buildAiTwinProvisioningSql({
        identities: [{ ...makeIdentity(null), twinName: 'OVERRIDE_AI' }],
        roleForTwin: '{ai_identity_name}_ROLE',
    });
    expect(sql).toContain('DEFAULT_ROLE = OVERRIDE_AI_ROLE');
    expect(sql).toContain('GRANT ROLE OVERRIDE_AI_ROLE TO USER OVERRIDE_AI;');
});

it('omits role statements when automation owns grants', () => {
    const sql = buildAiTwinProvisioningSql({
        identities: [makeIdentity('PERSON')],
        roleForTwin: null,
    });
    expect(sql).toContain(
        '-- Roles are not granted by this script. Your automation grants each AI identity its role.',
    );
    expect(sql).not.toContain('DEFAULT_ROLE');
    expect(sql).not.toContain('GRANT ROLE');
    expect(sql).not.toContain('{role_without_pii}');
});

it.each(['', 'A; DROP USER B', '{unknown}_ROLE', 'ROLE-NAME'])(
    'rejects invalid template %s',
    (roleForTwin) => {
        expect(() =>
            buildAiTwinProvisioningSql({ identities: [], roleForTwin }),
        ).toThrow('Invalid Snowflake role template');
    },
);

it.each(['A-B', 'PERSON@EXAMPLE.COM', 'A\nB'])(
    'validates the filled role for %s',
    (login) => {
        expect(() =>
            buildAiTwinProvisioningSql({
                identities: [makeIdentity(login)],
                roleForTwin: '{snowflake_login}_ROLE',
            }),
        ).toThrow('Invalid Snowflake role after filling');
    },
);

it('requires a login to fill a template, but accepts a fixed role without one', () => {
    expect(() =>
        buildAiTwinProvisioningSql({
            identities: [makeIdentity(null)],
            roleForTwin: '{snowflake_login}_ROLE',
        }),
    ).toThrow('Snowflake sign-in is required');
    expect(
        buildAiTwinProvisioningSql({
            identities: [makeIdentity(null)],
            roleForTwin: 'FIXED_ROLE',
        }),
    ).toContain('DEFAULT_ROLE = FIXED_ROLE');
});

it('quotes valid role names that start with a digit or dollar', () => {
    expect(
        buildAiTwinProvisioningSql({
            identities: [makeIdentity('PERSON')],
            roleForTwin: '123$ROLE',
        }),
    ).toContain('DEFAULT_ROLE = "123$ROLE"');
});

it('lists skipped people before SQL statements', () => {
    const sql = buildAiTwinProvisioningSql({
        identities: [makeIdentity('PERSON')],
        roleForTwin: '{snowflake_login}_AI_ROLE',
        skipped: [
            { email: 'missing@example.com', reason: 'No Snowflake login' },
        ],
    });
    expect(sql).toContain('-- Skipped missing@example.com: No Snowflake login');
    expect(sql.indexOf('-- Skipped missing@example.com')).toBeLessThan(
        sql.indexOf('CREATE USER'),
    );
});
