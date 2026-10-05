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
