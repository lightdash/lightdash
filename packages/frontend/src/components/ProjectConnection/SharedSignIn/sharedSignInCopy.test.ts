import { PersonSignInProvider } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getSharedSignInExpiry,
    shouldOpenSharedSignInReconnectModal,
} from './sharedSignInCopy';

describe('getSharedSignInExpiry', () => {
    it('reads the attributed sign-in from an API error', () => {
        const sharedSignIn = {
            provider: PersonSignInProvider.GOOGLE,
            subjectUserUuid: 'u',
            subjectName: 'Sam Rivera',
            subjectBasis: 'recorded',
        };
        expect(getSharedSignInExpiry({ data: { sharedSignIn } })).toEqual(
            sharedSignIn,
        );
        expect(getSharedSignInExpiry({ data: {} })).toBeNull();
    });
});

describe('shouldOpenSharedSignInReconnectModal', () => {
    it('opens only for an expired sign-in the viewer can reconnect', () => {
        const status = {
            provider: PersonSignInProvider.GOOGLE,
            subject: null,
            expired: true,
            canReconnect: true,
        };
        expect(shouldOpenSharedSignInReconnectModal(status)).toBe(true);
        expect(
            shouldOpenSharedSignInReconnectModal({
                ...status,
                canReconnect: false,
            }),
        ).toBe(false);
        expect(
            shouldOpenSharedSignInReconnectModal({ ...status, expired: false }),
        ).toBe(false);
        expect(shouldOpenSharedSignInReconnectModal(null)).toBe(false);
    });
});
