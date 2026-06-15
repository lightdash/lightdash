import { PullRequestProvider } from '@lightdash/common';
import type { SessionUser } from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { getOrRefreshToken } from '../../clients/github/Github';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { GitUserCredentialsModel } from '../../models/GitUserCredentials/GitUserCredentialsModel';
import type { UserModel } from '../../models/UserModel';
import type { FeatureFlagService } from '../FeatureFlag/FeatureFlagService';
import { GithubAppService } from './GithubAppService';

jest.mock('../../clients/github/Github', () => ({
    getGithubUserAuthorizeUrl: jest
        .fn()
        .mockReturnValue('https://github.com/login/oauth/authorize'),
    getOrRefreshToken: jest.fn(),
}));

const organizationUuid = 'org-uuid';
const user = {
    userUuid: 'user-uuid',
    organizationUuid,
    organizationName: 'org',
    organizationCreatedAt: new Date(),
    role: 'admin',
} as SessionUser;

const buildService = ({
    featureEnabled = true,
    findCredential,
    deleteCredential = jest.fn(),
    updateTokens = jest.fn(),
}: {
    featureEnabled?: boolean;
    findCredential?: jest.Mock;
    deleteCredential?: jest.Mock;
    updateTokens?: jest.Mock;
} = {}) =>
    new GithubAppService({
        githubAppInstallationsModel:
            {} as unknown as GithubAppInstallationsModel,
        gitUserCredentialsModel: {
            findCredential:
                findCredential ?? jest.fn().mockResolvedValue(undefined),
            deleteCredential,
            updateTokens,
        } as unknown as GitUserCredentialsModel,
        userModel: {} as unknown as UserModel,
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        featureFlagService: {
            get: jest.fn().mockResolvedValue({ enabled: featureEnabled }),
        } as unknown as FeatureFlagService,
    });

describe('GithubAppService', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('linkUserRedirect (open redirect protection)', () => {
        it.each([
            ['https://evil.com/phish', '/generalSettings/integrations'],
            ['//evil.com', '/generalSettings/integrations'],
            ['/\\evil.com', '/generalSettings/integrations'],
            ['evil.com', '/generalSettings/integrations'],
            ['https:evil.com', '/generalSettings/integrations'],
        ])(
            'coerces unsafe returnTo %s to a same-origin path',
            async (returnToPath, expectedPath) => {
                const service = buildService();
                const { returnToUrl } = await service.linkUserRedirect(
                    user,
                    returnToPath,
                );
                expect(returnToUrl).toBe(
                    `${lightdashConfigMock.siteUrl}${expectedPath}`,
                );
            },
        );

        it('preserves a safe same-origin relative path', async () => {
            const service = buildService();
            const { returnToUrl } = await service.linkUserRedirect(
                user,
                '/projects/abc/settings?tab=git',
            );
            expect(returnToUrl).toBe(
                `${lightdashConfigMock.siteUrl}/projects/abc/settings?tab=git`,
            );
        });
    });

    describe('getAiWritebackAttribution', () => {
        it('reports org/canLink:false without reading the credential when the feature is disabled', async () => {
            const findCredential = jest.fn();
            const service = buildService({
                featureEnabled: false,
                findCredential,
            });

            const attribution = await service.getAiWritebackAttribution({
                userUuid: user.userUuid,
                organizationUuid,
            });

            expect(attribution).toEqual({ mode: 'org', canLink: false });
            expect(findCredential).not.toHaveBeenCalled();
        });

        it('reports personal attribution with the linked login when a credential exists', async () => {
            const service = buildService({
                featureEnabled: true,
                findCredential: jest.fn().mockResolvedValue({
                    providerLogin: 'octocat',
                    token: 't',
                    refreshToken: 'r',
                }),
            });

            const attribution = await service.getAiWritebackAttribution({
                userUuid: user.userUuid,
                organizationUuid,
            });

            expect(attribution).toEqual({
                mode: 'personal',
                githubLogin: 'octocat',
            });
        });

        it('reports org/canLink:true when the feature is on but no credential is linked', async () => {
            const service = buildService({
                featureEnabled: true,
                findCredential: jest.fn().mockResolvedValue(undefined),
            });

            const attribution = await service.getAiWritebackAttribution({
                userUuid: user.userUuid,
                organizationUuid,
            });

            expect(attribution).toEqual({ mode: 'org', canLink: true });
        });
    });

    describe('getValidUserToken (credential retention on refresh failure)', () => {
        const credential = {
            token: 'old-token',
            refreshToken: 'refresh-token',
        };

        it('keeps the credential on a transient refresh failure', async () => {
            const deleteCredential = jest.fn();
            const service = buildService({
                findCredential: jest.fn().mockResolvedValue(credential),
                deleteCredential,
            });
            (getOrRefreshToken as jest.Mock).mockRejectedValue(
                Object.assign(new Error('socket hang up'), { status: 503 }),
            );

            const token = await service.getValidUserToken(
                user.userUuid,
                organizationUuid,
            );

            expect(token).toBeUndefined();
            expect(deleteCredential).not.toHaveBeenCalled();
        });

        it('deletes the credential when the token is revoked', async () => {
            const deleteCredential = jest.fn();
            const service = buildService({
                findCredential: jest.fn().mockResolvedValue(credential),
                deleteCredential,
            });
            (getOrRefreshToken as jest.Mock).mockRejectedValue(
                Object.assign(new Error('bad refresh token'), {
                    response: {
                        status: 400,
                        data: { error: 'bad_refresh_token' },
                    },
                }),
            );

            const token = await service.getValidUserToken(
                user.userUuid,
                organizationUuid,
            );

            expect(token).toBeUndefined();
            expect(deleteCredential).toHaveBeenCalledWith(
                user.userUuid,
                organizationUuid,
                PullRequestProvider.GITHUB,
            );
        });
    });
});
