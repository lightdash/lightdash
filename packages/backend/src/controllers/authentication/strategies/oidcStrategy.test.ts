import { OpenIdIdentityIssuerType } from '@lightdash/common';
import { Request } from 'express';
import { Profile as PassportProfile } from 'passport';
import { genericOidcHandler } from './oidcStrategy';

const makeRequest = (loginWithOpenId = vi.fn()) =>
    ({
        session: { oauth: {} },
        services: {
            getUserService: () => ({
                loginWithOpenId,
            }),
        },
        ip: '127.0.0.1',
        get: vi.fn(() => 'test-user-agent'),
    }) as unknown as Request;

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
            makeRequest(loginWithOpenId),
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
});
