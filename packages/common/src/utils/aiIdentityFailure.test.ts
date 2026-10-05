import { describe, expect, it } from 'vitest';
import { AiIdentityFailureReason } from '../types/aiIdentity';
import {
    buildAiIdentityFixSql,
    classifyAiIdentityFailure,
    getAiIdentityFailureGroupCopy,
} from './aiIdentityFailure';

describe('AI identity failure guidance', () => {
    it.each([
        ['JWT token is invalid.', AiIdentityFailureReason.KEY_OR_USER_REJECTED],
        [
            'Snowflake did not mark this session as an agent session.',
            AiIdentityFailureReason.NOT_SERVICE_AGENT,
        ],
        [
            'Snowflake signed in as OTHER, not PERSON_AI.',
            AiIdentityFailureReason.WRONG_USER,
        ],
        [
            'Failed to select Snowflake warehouse "WH" (user="X_AI", role="R", session_id="1"): SQL compilation error:\nObject does not exist, or operation cannot be performed.',
            AiIdentityFailureReason.WAREHOUSE_ACCESS,
        ],
        [
            'No active warehouse selected.',
            AiIdentityFailureReason.WAREHOUSE_ACCESS,
        ],
        ['User account is locked.', AiIdentityFailureReason.DISABLED_OR_LOCKED],
        ['User disabled.', AiIdentityFailureReason.DISABLED_OR_LOCKED],
        [
            'IP address is not allowed to access Snowflake.',
            AiIdentityFailureReason.NETWORK_POLICY,
        ],
        ['Unexpected network failure.', AiIdentityFailureReason.UNKNOWN],
    ])('classifies %s', (message, reason) => {
        expect(classifyAiIdentityFailure(message)).toBe(reason);
    });

    it('creates a user and sets its public key for an invalid JWT', () => {
        expect(
            buildAiIdentityFixSql({
                reason: AiIdentityFailureReason.KEY_OR_USER_REJECTED,
                twinName: 'PERSON_AI',
                publicKey: 'KEY',
                roleForTwin: null,
                warehouse: 'WH',
            }),
        ).toBe(
            "CREATE USER IF NOT EXISTS PERSON_AI TYPE = SERVICE_AGENT RSA_PUBLIC_KEY = 'KEY';\n" +
                "ALTER USER PERSON_AI SET RSA_PUBLIC_KEY = 'KEY';",
        );
    });

    it('quotes unsafe names and comments out warehouse grants without a role', () => {
        expect(
            buildAiIdentityFixSql({
                reason: AiIdentityFailureReason.WAREHOUSE_ACCESS,
                twinName: 'A-B',
                publicKey: null,
                roleForTwin: null,
                warehouse: 'WH',
            }),
        ).toBe(
            '-- Replace AI_ROLE with the role your automation grants to this AI identity.\n-- GRANT USAGE ON WAREHOUSE WH TO ROLE AI_ROLE;',
        );
        expect(
            buildAiIdentityFixSql({
                reason: AiIdentityFailureReason.NOT_SERVICE_AGENT,
                twinName: 'A-B',
                publicKey: null,
                roleForTwin: null,
                warehouse: 'WH',
            }),
        ).toBe('ALTER USER "A-B" SET TYPE = SERVICE_AGENT;');
    });

    it('marks wrong-user failures as security issues', () => {
        expect(
            getAiIdentityFailureGroupCopy(AiIdentityFailureReason.WRONG_USER)
                .severity,
        ).toBe('security');
        expect(
            getAiIdentityFailureGroupCopy(
                AiIdentityFailureReason.KEY_OR_USER_REJECTED,
            ).severity,
        ).toBe('availability');
    });
});

it('uses the connection warehouse and known role in a runnable grant', () => {
    expect(
        buildAiIdentityFixSql({
            reason: AiIdentityFailureReason.WAREHOUSE_ACCESS,
            twinName: 'PERSON_AI',
            publicKey: null,
            roleForTwin: 'AI_ROLE',
            warehouse: 'A-B',
        }),
    ).toBe('GRANT USAGE ON WAREHOUSE "A-B" TO ROLE AI_ROLE;');
});

it('sets and grants the saved role when fixing a rejected identity', () => {
    const sql = buildAiIdentityFixSql({
        reason: AiIdentityFailureReason.KEY_OR_USER_REJECTED,
        twinName: 'PERSON_AI',
        publicKey: 'KEY',
        roleForTwin: 'PERSON_AI_ROLE',
        warehouse: null,
    });
    expect(sql).toContain(
        "RSA_PUBLIC_KEY = 'KEY' DEFAULT_ROLE = PERSON_AI_ROLE;",
    );
    expect(sql).toContain(
        'ALTER USER PERSON_AI SET DEFAULT_ROLE = PERSON_AI_ROLE;',
    );
    expect(sql).toContain('GRANT ROLE PERSON_AI_ROLE TO USER PERSON_AI;');
});

it('does not generate a grant without a connection warehouse', () => {
    const sql = buildAiIdentityFixSql({
        reason: AiIdentityFailureReason.WAREHOUSE_ACCESS,
        twinName: 'PERSON_AI',
        publicKey: null,
        roleForTwin: 'AI_ROLE',
        warehouse: null,
    });
    expect(sql).toBe(
        '-- Select a warehouse in the connection before granting warehouse usage.',
    );
});
