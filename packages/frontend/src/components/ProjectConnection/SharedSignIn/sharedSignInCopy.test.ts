import { PersonSignInProvider } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getSharedSignInExpiry } from './sharedSignInCopy';

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
