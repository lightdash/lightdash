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
