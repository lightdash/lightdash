import { isOpenIdIdentityIssuerType } from './openIdIdentity';
import { LocalIssuerTypes, type LoginOptionTypes } from './user';

/**
 * Name of the cookie that records the auth method a returning user last logged
 * in with. Read by the frontend (non-httpOnly) so the login page can surface a
 * PostHog-style "Last used" hint — including private per-org SSO methods that
 * are otherwise hidden until the email is prechecked.
 */
export const LAST_LOGIN_METHOD_COOKIE_NAME = 'ld.last_login_method';

/**
 * Stored in a JS-readable (non-httpOnly) cookie. Contains only the provider
 * identifier and the user's own email (forwarded as `login_hint` so per-org SSO
 * can be resolved without retyping). Never contains a token or secret.
 */
export type LastLoginMethod = {
    issuerType: LoginOptionTypes;
    email: string;
};

const isLoginOptionType = (value: unknown): value is LoginOptionTypes =>
    typeof value === 'string' &&
    (isOpenIdIdentityIssuerType(value) ||
        Object.values(LocalIssuerTypes).includes(value as LocalIssuerTypes));

export const encodeLastLoginMethodCookie = (value: LastLoginMethod): string =>
    encodeURIComponent(JSON.stringify(value));

/**
 * Parse the cookie value. Returns null on any malformed/unexpected input so the
 * login page falls back to its default behaviour rather than crashing.
 */
export const decodeLastLoginMethodCookie = (
    raw: string | undefined | null,
): LastLoginMethod | null => {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(decodeURIComponent(raw));
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            'issuerType' in parsed &&
            'email' in parsed &&
            isLoginOptionType((parsed as { issuerType: unknown }).issuerType) &&
            typeof (parsed as { email: unknown }).email === 'string'
        ) {
            return {
                issuerType: (parsed as LastLoginMethod).issuerType,
                email: (parsed as LastLoginMethod).email,
            };
        }
        return null;
    } catch {
        return null;
    }
};
