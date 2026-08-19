import {
    OpenIdIdentityIssuerType,
    OrganizationSsoProvider,
} from '@lightdash/common';
import { Request } from 'express';
import { Profile as PassportProfile } from 'passport';
import { genericOidcHandler } from './oidcStrategy';

const makeRequest = ({
    loginWithOpenId = vi.fn(),
    isEmailDomainAllowedForOrgSso = vi.fn().mockResolvedValue(true),
}: {
    loginWithOpenId?: ReturnType<typeof vi.fn>;
    isEmailDomainAllowedForOrgSso?: ReturnType<typeof vi.fn>;
} = {}) =>
    ({
        session: { oauth: {} },
        user: undefined,
        services: {
            getUserService: () => ({
                loginWithOpenId,
            }),
            getOrganizationSsoService: () => ({
                isEmailDomainAllowedForOrgSso,
            }),
        },
        ip: '127.0.0.1',
        get: vi.fn(() => 'test-user-agent'),
    }) as unknown as Request;

const verifiedProfile = (email: string): PassportProfile =>
    ({
        id: 'subject-1',
        emails: [{ value: email }],
        _json: { email_verified: true },
    }) as unknown as PassportProfile;

describe('genericOidcHandler', () => {
    test('rejects profiles with explicitly unverified email claims', async () => {
        const loginWithOpenId = vi.fn();
        const done = vi.fn();
        const handler = genericOidcHandler(
            OpenIdIdentityIssuerType.GENERIC_OIDC,
        );
        const profile = {
            id: 'subject-1',
            emails: [{ value: 'user@example.com' }],
            _json: {
                email_verified: false,
            },
        } as unknown as PassportProfile;

        await handler(
            makeRequest({ loginWithOpenId }),
            'https://issuer.example.com',
            profile,
            done,
        );

        expect(loginWithOpenId).not.toHaveBeenCalled();
        expect(done).toHaveBeenCalledWith(null, false, {
            message:
                'Authentication failed: email is not verified in OpenID profile.',
        });
    });

    describe('per-org SSO callback domain re-check', () => {
        test('rejects an IdP identity whose email domain is outside the authorizing per-org method whitelist', async () => {
            const loginWithOpenId = vi.fn();
            // The authorizing org's method does not route this email's domain.
            const isEmailDomainAllowedForOrgSso = vi
                .fn()
                .mockResolvedValue(false);
            const done = vi.fn();
            const handler = genericOidcHandler(
                OpenIdIdentityIssuerType.GENERIC_OIDC,
                'https://idp-a.example.com',
                {
                    organizationUuid: 'org-a-uuid',
                    provider: OrganizationSsoProvider.GENERIC_OIDC,
                },
            );

            await handler(
                makeRequest({ loginWithOpenId, isEmailDomainAllowedForOrgSso }),
                'https://idp-a.example.com',
                verifiedProfile('user@domain-b.com'),
                done,
            );

            expect(isEmailDomainAllowedForOrgSso).toHaveBeenCalledWith(
                'user@domain-b.com',
                'org-a-uuid',
                OrganizationSsoProvider.GENERIC_OIDC,
            );
            expect(loginWithOpenId).not.toHaveBeenCalled();
            expect(done).toHaveBeenCalledWith(
                null,
                false,
                expect.objectContaining({ message: expect.any(String) }),
            );
        });

        test('allows an IdP identity whose email domain is inside the authorizing per-org method whitelist', async () => {
            const loginWithOpenId = vi.fn().mockResolvedValue({
                userUuid: 'user-1',
            });
            const isEmailDomainAllowedForOrgSso = vi
                .fn()
                .mockResolvedValue(true);
            const done = vi.fn();
            const handler = genericOidcHandler(
                OpenIdIdentityIssuerType.GENERIC_OIDC,
                'https://acme-idp.example.com',
                {
                    organizationUuid: 'acme-org-uuid',
                    provider: OrganizationSsoProvider.GENERIC_OIDC,
                },
            );

            await handler(
                makeRequest({ loginWithOpenId, isEmailDomainAllowedForOrgSso }),
                'https://acme-idp.example.com',
                verifiedProfile('user@acme.com'),
                done,
            );

            expect(isEmailDomainAllowedForOrgSso).toHaveBeenCalledWith(
                'user@acme.com',
                'acme-org-uuid',
                OrganizationSsoProvider.GENERIC_OIDC,
            );
            expect(loginWithOpenId).toHaveBeenCalledTimes(1);
            expect(done).toHaveBeenCalledWith(null, { userUuid: 'user-1' });
        });

        test('does not re-check when no per-org context is present (env-based single-tenant strategy)', async () => {
            const loginWithOpenId = vi.fn().mockResolvedValue({
                userUuid: 'user-1',
            });
            const isEmailDomainAllowedForOrgSso = vi.fn();
            const done = vi.fn();
            const handler = genericOidcHandler(
                OpenIdIdentityIssuerType.GENERIC_OIDC,
                'https://issuer.example.com',
            );

            await handler(
                makeRequest({ loginWithOpenId, isEmailDomainAllowedForOrgSso }),
                'https://issuer.example.com',
                verifiedProfile('anyone@anywhere.com'),
                done,
            );

            expect(isEmailDomainAllowedForOrgSso).not.toHaveBeenCalled();
            expect(loginWithOpenId).toHaveBeenCalledTimes(1);
        });
    });
});
