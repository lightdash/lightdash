import { describe, expect, it } from 'vitest';
import { getVerificationSavePrompt } from './useVerificationSavePrompt';

const VERIFIER = 'verifier-uuid';
const verification = {
    verifiedBy: { userUuid: VERIFIER },
} as Parameters<typeof getVerificationSavePrompt>[0]['verification'];

describe('getVerificationSavePrompt', () => {
    it('is undefined for an unverified chart', () => {
        expect(
            getVerificationSavePrompt({
                verification: null,
                canManageContentVerification: false,
                userUuid: 'someone',
            }),
        ).toBeUndefined();
    });

    it('is undefined when verification is absent', () => {
        expect(
            getVerificationSavePrompt({
                verification: undefined,
                canManageContentVerification: true,
                userUuid: 'someone',
            }),
        ).toBeUndefined();
    });

    it('confirms keeping the badge for someone who can manage verification', () => {
        expect(
            getVerificationSavePrompt({
                verification,
                canManageContentVerification: true,
                userUuid: 'someone-else',
            }),
        ).toBe('confirm-keep');
    });

    it('confirms keeping the badge for the verifier without the scope', () => {
        expect(
            getVerificationSavePrompt({
                verification,
                canManageContentVerification: false,
                userUuid: VERIFIER,
            }),
        ).toBe('confirm-keep');
    });

    it('warns about removal for anyone else', () => {
        expect(
            getVerificationSavePrompt({
                verification,
                canManageContentVerification: false,
                userUuid: 'someone-else',
            }),
        ).toBe('warn-removal');
    });

    it('warns about removal for an anonymous actor', () => {
        expect(
            getVerificationSavePrompt({
                verification,
                canManageContentVerification: false,
                userUuid: undefined,
            }),
        ).toBe('warn-removal');
    });
});
