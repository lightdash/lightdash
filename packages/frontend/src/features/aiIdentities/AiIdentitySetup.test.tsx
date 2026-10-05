import { AiIdentityState, type AiIdentity } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getIdentityPreview, getRoleMode } from './setupPreview';

const identity: AiIdentity = {
    aiIdentityUuid: 'identity',
    aiIdentityAccountUuid: 'account',
    snowflakeAccount: 'ACCOUNT',
    userUuid: 'user',
    email: 'person@example.com',
    firstName: 'Person',
    lastName: 'Example',
    snowflakeLogin: null,
    twinNameOverride: 'OVERRIDE_AI',
    twinName: 'OVERRIDE_AI',
    publicKey: null,
    publicKeyFingerprint: null,
    state: AiIdentityState.PENDING,
    stale: false,
    failureReason: null,
    statusMessage: null,
    checkedAt: null,
    createdAt: new Date(),
};

describe('AI identity setup preview', () => {
    it('recognises the saved role setting', () => {
        expect(getRoleMode(null)).toBe('none');
        expect(getRoleMode('SHARED_ROLE')).toBe('shared');
        expect(getRoleMode('{ai_identity_name}_ROLE')).toBe('template');
    });

    it('fills a role from an identity override without a login', () => {
        expect(
            getIdentityPreview(
                identity,
                '{snowflake_login}_AI',
                '{ai_identity_name}_ROLE',
            ),
        ).toEqual({
            name: 'OVERRIDE_AI',
            role: 'OVERRIDE_AI_ROLE',
        });
    });

    it('shows why a login based role is skipped', () => {
        expect(
            getIdentityPreview(
                identity,
                '{snowflake_login}_AI',
                '{snowflake_login}_ROLE',
            ).role,
        ).toBe('Skipped: no Snowflake login recorded');
    });
});
