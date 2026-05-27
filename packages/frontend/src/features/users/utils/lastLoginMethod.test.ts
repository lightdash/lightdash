import { LocalIssuerTypes, OpenIdIdentityIssuerType } from '@lightdash/common';
import { afterEach, describe, expect, it } from 'vitest';
import {
    readLastLoginMethod,
    writeLastLoginMethod,
    type LastLoginMethod,
} from './lastLoginMethod';

const COOKIE_NAME = 'ld.last_login_method';

const setRawCookie = (value: string) => {
    document.cookie = `${COOKIE_NAME}=${value}; Path=/`;
};

const clearCookie = () => {
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0`;
};

describe('lastLoginMethod cookie', () => {
    afterEach(() => clearCookie());

    it('round-trips an SSO login method', () => {
        const value: LastLoginMethod = {
            issuerType: OpenIdIdentityIssuerType.AZUREAD,
            email: 'jane@acme.com',
        };
        writeLastLoginMethod(value);
        expect(readLastLoginMethod()).toEqual(value);
    });

    it('round-trips an email/password login method', () => {
        const value: LastLoginMethod = {
            issuerType: LocalIssuerTypes.EMAIL,
            email: 'jane@acme.com',
        };
        writeLastLoginMethod(value);
        expect(readLastLoginMethod()).toEqual(value);
    });

    it('returns null when no cookie is set', () => {
        expect(readLastLoginMethod()).toBeNull();
    });

    it('returns null for a malformed cookie value', () => {
        setRawCookie('not-json');
        expect(readLastLoginMethod()).toBeNull();
    });

    it('returns null when the issuer is not a known provider', () => {
        setRawCookie(
            encodeURIComponent(
                JSON.stringify({
                    issuerType: 'notaprovider',
                    email: 'a@b.com',
                }),
            ),
        );
        expect(readLastLoginMethod()).toBeNull();
    });

    it('returns null when required fields are missing or wrong-typed', () => {
        setRawCookie(encodeURIComponent(JSON.stringify({ email: 'a@b.com' })));
        expect(readLastLoginMethod()).toBeNull();

        setRawCookie(
            encodeURIComponent(
                JSON.stringify({ issuerType: 'google', email: 42 }),
            ),
        );
        expect(readLastLoginMethod()).toBeNull();
    });
});
