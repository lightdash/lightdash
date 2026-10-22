import { Ability } from '@casl/ability';
import {
    OpenIdIdentityIssuerType,
    OrganizationMemberRole,
    SessionUser,
} from '@lightdash/common';
import {
    GoogleCallbackParameters,
    Profile,
    VerifyCallback,
} from 'passport-google-oauth20';
import { UserService } from '../../../services/UserService';
import { googleStrategyVerify } from './googleStrategy';

const user = {
    userUuid: '11111111-1111-4111-8111-111111111111',
    userId: 1,
    email: 'lightdash@example.com',
    firstName: 'Lightdash',
    lastName: 'User',
    organizationUuid: '22222222-2222-4222-8222-222222222222',
    organizationName: 'Test',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    role: OrganizationMemberRole.ADMIN,
    isActive: true,
    ability: new Ability(),
    abilityRules: [],
    timezone: null,
    avatarUrl: null,
    avatarGradient: null,
    createdAt: new Date(),
    updatedAt: new Date(),
} as SessionUser;

const profile = {
    id: 'shared-google-subject',
    emails: [{ value: 'shared@example.com', verified: true }],
    name: { givenName: 'Shared', familyName: 'Account' },
} as unknown as Profile;

const params = {
    scope: 'openid email https://www.googleapis.com/auth/bigquery',
} as GoogleCallbackParameters;

const createUserService = () => ({
    storeOAuthGrant: vi.fn<UserService['storeOAuthGrant']>(async () => {}),
    loginWithOpenId: vi.fn<UserService['loginWithOpenId']>(async () => user),
    createBigqueryWarehouseCredentials: vi.fn<
        UserService['createBigqueryWarehouseCredentials']
    >(async () => {}),
});

describe('googleStrategyVerify', () => {
    it('stores a link grant without entering the login identity path', async () => {
        const userService = createUserService();
        const done = vi.fn<VerifyCallback>();
        const req = {
            session: { oauth: { intent: 'link' } },
            user,
            services: { getUserService: () => userService },
        } as unknown as Express.Request;

        await googleStrategyVerify(
            req,
            'access-token',
            'refresh-token',
            params,
            profile,
            done,
        );

        expect(userService.storeOAuthGrant).toHaveBeenCalledWith(
            user,
            OpenIdIdentityIssuerType.GOOGLE,
            'refresh-token',
            ['openid', 'email', 'https://www.googleapis.com/auth/bigquery'],
            expect.objectContaining({
                subject: profile.id,
                email: profile.emails?.[0].value,
            }),
        );
        expect(userService.loginWithOpenId).not.toHaveBeenCalled();
        expect(
            userService.createBigqueryWarehouseCredentials,
        ).toHaveBeenCalledWith(user, 'refresh-token');
        expect(done).toHaveBeenCalledWith(null, user);
    });

    it('rejects a Google profile whose email is not verified before logging in', async () => {
        const userService = createUserService();
        const done = vi.fn<VerifyCallback>();
        const req = {
            ip: '127.0.0.1',
            get: vi.fn(() => 'test-agent'),
            session: { oauth: {} },
            services: { getUserService: () => userService },
        } as unknown as Express.Request;
        const unverifiedProfile = {
            ...profile,
            emails: [{ value: 'shared@example.com', verified: false }],
        } as unknown as Profile;

        await googleStrategyVerify(
            req,
            'access-token',
            'refresh-token',
            params,
            unverifiedProfile,
            done,
        );

        expect(userService.loginWithOpenId).not.toHaveBeenCalled();
        expect(done).toHaveBeenCalledWith(null, undefined, {
            message:
                'Authentication failed: email is not verified in Google profile.',
        });
    });

    it('stores the grant separately after a login flow', async () => {
        const userService = createUserService();
        const done = vi.fn<VerifyCallback>();
        const req = {
            ip: '127.0.0.1',
            get: vi.fn(() => 'test-agent'),
            session: { oauth: {} },
            services: { getUserService: () => userService },
        } as unknown as Express.Request;

        await googleStrategyVerify(
            req,
            'access-token',
            'refresh-token',
            params,
            profile,
            done,
        );

        expect(userService.loginWithOpenId).toHaveBeenCalledWith(
            expect.any(Object),
            undefined,
            undefined,
            undefined,
            { ip: '127.0.0.1', userAgent: 'test-agent' },
        );
        expect(userService.storeOAuthGrant).toHaveBeenCalledWith(
            user,
            OpenIdIdentityIssuerType.GOOGLE,
            'refresh-token',
            ['openid', 'email', 'https://www.googleapis.com/auth/bigquery'],
            expect.any(Object),
        );
    });
});

describe('Google reconnect callback', () => {
    const setup = () => {
        const currentUser = { ...user, userUuid: 'user_a' };
        const currentProfile = {
            ...profile,
            id: 'subject_a',
            emails: [{ value: 'account_a', verified: true }],
        } as unknown as Profile;
        const service = {
            ...createUserService(),
            reconnectPersonalBigqueryCredentials: vi.fn(async () => undefined),
        };
        const req = {
            session: {
                oauth: {
                    intent: 'link',
                    googleReconnect: {
                        userUuid: 'user_a',
                        subject: 'subject_a',
                        email: 'account_a',
                        consentAttempted: false,
                        retryWithConsent: false,
                    },
                    googlePersonalReconnect: {
                        userUuid: 'user_a',
                        credentialUuid: 'credential_a',
                    },
                },
            },
            user: currentUser,
            services: { getUserService: () => service },
        } as unknown as Express.Request;
        return { req, service, currentProfile, done: vi.fn<VerifyCallback>() };
    };
    test('preserves the grant and credential when Google omits a refresh token', async () => {
        const { req, service, currentProfile, done } = setup();
        await googleStrategyVerify(
            req,
            'access_a',
            '',
            params,
            currentProfile,
            done,
        );
        expect(service.storeOAuthGrant).not.toHaveBeenCalled();
        expect(
            service.createBigqueryWarehouseCredentials,
        ).not.toHaveBeenCalled();
        expect(
            service.reconnectPersonalBigqueryCredentials,
        ).not.toHaveBeenCalled();
        expect(req.session.oauth?.googleReconnect?.retryWithConsent).toBe(true);
        expect(done).toHaveBeenCalledWith(null, req.user);
    });
    test('stops after the consent retry returns no token', async () => {
        const { req, service, currentProfile, done } = setup();
        req.session.oauth!.googleReconnect!.consentAttempted = true;
        await googleStrategyVerify(
            req,
            'access_a',
            '',
            params,
            currentProfile,
            done,
        );
        expect(service.storeOAuthGrant).not.toHaveBeenCalled();
        expect(done).toHaveBeenCalledWith(null, undefined, {
            message:
                'Google did not return a refresh token. Try signing in again.',
        });
    });
    test('a normal link passes an empty token through guarded grant storage', async () => {
        const { req, service, currentProfile, done } = setup();
        delete req.session.oauth!.googleReconnect;
        delete req.session.oauth!.googlePersonalReconnect;
        await googleStrategyVerify(req, '', '', params, currentProfile, done);
        expect(service.storeOAuthGrant).toHaveBeenCalledWith(
            req.user,
            OpenIdIdentityIssuerType.GOOGLE,
            '',
            expect.any(Array),
            expect.objectContaining({ subject: currentProfile.id }),
        );
        expect(
            service.createBigqueryWarehouseCredentials,
        ).not.toHaveBeenCalled();
        expect(done).toHaveBeenCalledWith(null, req.user);
    });
    test('reconnect without a stored identity still retries consent before any write', async () => {
        const { req, service, currentProfile, done } = setup();
        req.session.oauth!.googleReconnect!.subject = null;
        req.session.oauth!.googleReconnect!.email = null;
        await googleStrategyVerify(req, '', '', params, currentProfile, done);
        expect(service.storeOAuthGrant).not.toHaveBeenCalled();
        expect(req.session.oauth!.googleReconnect!.retryWithConsent).toBe(true);
        expect(done).toHaveBeenCalledWith(null, req.user);
    });
    test('updates only the selected personal credential', async () => {
        const { req, service, currentProfile, done } = setup();
        await googleStrategyVerify(
            req,
            'access_a',
            'token_b',
            params,
            currentProfile,
            done,
        );
        expect(service.storeOAuthGrant).toHaveBeenCalledOnce();
        expect(
            service.reconnectPersonalBigqueryCredentials,
        ).toHaveBeenCalledWith(req.user, 'credential_a', 'token_b');
        expect(
            service.createBigqueryWarehouseCredentials,
        ).not.toHaveBeenCalled();
        expect(service.loginWithOpenId).not.toHaveBeenCalled();
    });
    test.each(['subject', 'user'])(
        'rejects a changed %s before writing credentials',
        async (changed) => {
            const { req, service, currentProfile, done } = setup();
            if (changed === 'subject') currentProfile.id = 'subject_b';
            else req.session.oauth!.googleReconnect!.userUuid = 'user_b';
            await googleStrategyVerify(
                req,
                'access_a',
                'token_b',
                params,
                currentProfile,
                done,
            );
            expect(service.storeOAuthGrant).not.toHaveBeenCalled();
            expect(
                service.reconnectPersonalBigqueryCredentials,
            ).not.toHaveBeenCalled();
            expect(done).toHaveBeenCalledWith(
                null,
                undefined,
                expect.objectContaining({ message: expect.any(String) }),
            );
        },
    );
});
