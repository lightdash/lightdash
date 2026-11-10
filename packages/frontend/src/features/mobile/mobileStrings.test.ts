import { describe, expect, it } from 'vitest';
import { MOBILE_APP_SIGN_IN_STRINGS } from './mobileStrings';

describe('mobile sign-in strings', () => {
    it('fills the placeholders the apps copy', () => {
        expect(
            MOBILE_APP_SIGN_IN_STRINGS.confirmAccount(
                'app.example.com',
                'Te••• U.',
            ),
        ).toBe('Sign in to app.example.com as Te••• U.?');
        expect(MOBILE_APP_SIGN_IN_STRINGS.wrongNumber(2)).toBe(
            'Wrong number. 2 tries left.',
        );
        expect(MOBILE_APP_SIGN_IN_STRINGS.wrongNumber(1)).toBe(
            'Wrong number. 1 try left.',
        );
    });
});
