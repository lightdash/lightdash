import {
    decodeLastLoginMethodCookie,
    encodeLastLoginMethodCookie,
    type LastLoginMethod,
} from './lastLogin';
import { OpenIdIdentityIssuerType } from './openIdIdentity';
import { LocalIssuerTypes } from './user';

describe('lastLogin cookie helpers', () => {
    it('round-trips an SSO login method', () => {
        const value: LastLoginMethod = {
            issuerType: OpenIdIdentityIssuerType.AZUREAD,
            email: 'jane@acme.com',
        };
        expect(
            decodeLastLoginMethodCookie(encodeLastLoginMethodCookie(value)),
        ).toEqual(value);
    });

    it('round-trips an email/password login method', () => {
        const value: LastLoginMethod = {
            issuerType: LocalIssuerTypes.EMAIL,
            email: 'jane@acme.com',
        };
        expect(
            decodeLastLoginMethodCookie(encodeLastLoginMethodCookie(value)),
        ).toEqual(value);
    });

    it('returns null for empty/undefined input', () => {
        expect(decodeLastLoginMethodCookie(undefined)).toBeNull();
        expect(decodeLastLoginMethodCookie(null)).toBeNull();
        expect(decodeLastLoginMethodCookie('')).toBeNull();
    });

    it('returns null for malformed JSON', () => {
        expect(decodeLastLoginMethodCookie('not-json')).toBeNull();
        expect(decodeLastLoginMethodCookie('%7Bbroken')).toBeNull();
    });

    it('returns null when fields are missing or invalid', () => {
        expect(
            decodeLastLoginMethodCookie(
                encodeURIComponent(JSON.stringify({ email: 'a@b.com' })),
            ),
        ).toBeNull();
        expect(
            decodeLastLoginMethodCookie(
                encodeURIComponent(
                    JSON.stringify({
                        issuerType: 'notaprovider',
                        email: 'a@b.com',
                    }),
                ),
            ),
        ).toBeNull();
        expect(
            decodeLastLoginMethodCookie(
                encodeURIComponent(
                    JSON.stringify({ issuerType: 'google', email: 42 }),
                ),
            ),
        ).toBeNull();
    });
});
