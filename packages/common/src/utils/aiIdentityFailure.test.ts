import { describe, expect, it } from 'vitest';
import { AiIdentityFailureReason } from '../types/aiIdentity';
import {
    buildAiIdentityFixSql,
    classifyAiIdentityFailure,
    getAiIdentityFailureGroupCopy,
} from './aiIdentityFailure';

describe('AI identity failure guidance', () => {
    it.each([
        ['JWT token is invalid.', AiIdentityFailureReason.PUBLIC_KEY_NOT_SET],
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
                reason: AiIdentityFailureReason.PUBLIC_KEY_NOT_SET,
                twinName: 'PERSON_AI',
                publicKey: 'KEY',
                roleForTwin: null,
            }),
        ).toBe(
            "CREATE USER IF NOT EXISTS PERSON_AI TYPE = SERVICE_AGENT RSA_PUBLIC_KEY = 'KEY';\n" +
                "ALTER USER PERSON_AI SET RSA_PUBLIC_KEY = 'KEY';",
        );
    });

    it('quotes an unsafe name and supplies placeholders for warehouse access', () => {
        expect(
            buildAiIdentityFixSql({
                reason: AiIdentityFailureReason.WAREHOUSE_ACCESS,
                twinName: 'A-B',
                publicKey: null,
                roleForTwin: null,
            }),
        ).toBe('GRANT USAGE ON WAREHOUSE <warehouse> TO ROLE <role>;');
        expect(
            buildAiIdentityFixSql({
                reason: AiIdentityFailureReason.NOT_SERVICE_AGENT,
                twinName: 'A-B',
                publicKey: null,
                roleForTwin: null,
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
                AiIdentityFailureReason.PUBLIC_KEY_NOT_SET,
            ).severity,
        ).toBe('availability');
    });
});
