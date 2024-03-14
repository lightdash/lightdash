import { OpenIdIdentityIssuerType } from '@lightdash/common';
import {
    emailModel,
    groupsModel,
    inviteLinkModel,
    openIdIdentityModel,
    organizationAllowedEmailDomainsModel,
    organizationMemberProfileModel,
    organizationModel,
    passwordResetLinkModel,
    personalAccessTokenModel,
    sessionModel,
    userModel,
    userWarehouseCredentialsModel,
} from '../models/models';

import { analyticsMock } from '../analytics/LightdashAnalytics.mock';
import { emailClient } from '../clients/clients';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { LightdashConfig } from '../config/parseConfig';
import { UserService } from './UserService';

jest.mock('../database/database', () => ({}));
jest.mock('../clients/clients', () => ({}));

jest.mock('../models/models', () => ({
    userModel: {
        getOpenIdIssuer: jest.fn(async () => undefined),
    },
}));

const createUserService = (lightdashConfig: LightdashConfig) =>
    new UserService({
        analytics: analyticsMock,
        lightdashConfig,
        inviteLinkModel,
        userModel,
        groupsModel,
        sessionModel,
        emailModel,
        openIdIdentityModel,
        passwordResetLinkModel,
        emailClient,
        organizationMemberProfileModel,
        organizationModel,
        personalAccessTokenModel,
        organizationAllowedEmailDomainsModel,
        userWarehouseCredentialsModel,
    });

jest.spyOn(analyticsMock, 'track');
describe('DashboardService', () => {
    const userService = createUserService(lightdashConfigMock);

    afterEach(() => {
        jest.clearAllMocks();
    });
    test('should return email and no sso (default case)', async () => {
        expect(await userService.getLoginOptions('test@lightdash.com')).toEqual(
            {
                forceRedirect: false,
                redirectUri: undefined,
                showOptions: ['email'],
            },
        );
    });
    test('should return no options if email and sso are disabled', async () => {
        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: true,
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: false,
            redirectUri: undefined,
            showOptions: [],
        });
    });
    test('should previous logged in sso provider', async () => {
        (userModel.getOpenIdIssuer as jest.Mock).mockImplementationOnce(
            async () => OpenIdIdentityIssuerType.OKTA,
        );

        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: false,
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    loginPath: '/login/okta',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: true,
            redirectUri: 'https://test.lightdash.cloud/api/v1/login/okta',
            showOptions: ['okta'],
        });
    });
    test('redirect is true if only one option is available', async () => {
        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: true,
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: true,
            redirectUri: 'https://test.lightdash.cloud/api/v1/login/google',
            showOptions: ['google'],
        });
    });
    test('should return all available sso providers and email', async () => {
        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: false,
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    oauth2ClientId: '1',
                    loginPath: '/login/okta',
                },
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
                oneLogin: {
                    ...lightdashConfigMock.auth.oneLogin,
                    oauth2ClientId: '1',
                    loginPath: '/login/oneLogin',
                },
                azuread: {
                    ...lightdashConfigMock.auth.azuread,
                    oauth2ClientId: '1',
                    loginPath: '/login/azuread',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: false,
            redirectUri: 'https://test.lightdash.cloud/api/v1/login/azuread',
            showOptions: ['azuread', 'google', 'okta', 'oneLogin', 'email'],
        });
    });

    test('should return all available sso providers but no email', async () => {
        const service = createUserService({
            ...lightdashConfigMock,
            auth: {
                ...lightdashConfigMock.auth,
                disablePasswordAuthentication: true,
                okta: {
                    ...lightdashConfigMock.auth.okta,
                    oauth2ClientId: '1',
                    loginPath: '/login/okta',
                },
                google: {
                    ...lightdashConfigMock.auth.google,
                    enabled: true,
                    loginPath: '/login/google',
                },
                oneLogin: {
                    ...lightdashConfigMock.auth.oneLogin,
                    oauth2ClientId: '1',
                    loginPath: '/login/oneLogin',
                },
                azuread: {
                    ...lightdashConfigMock.auth.azuread,
                    oauth2ClientId: '1',
                    loginPath: '/login/azuread',
                },
            },
        });

        expect(await service.getLoginOptions('test@lightdash.com')).toEqual({
            forceRedirect: false,
            redirectUri: 'https://test.lightdash.cloud/api/v1/login/azuread',
            showOptions: ['azuread', 'google', 'okta', 'oneLogin'],
        });
    });
});
