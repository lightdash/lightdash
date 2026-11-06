import {
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    ProjectMemberRole,
    PullRequestProvider,
} from '@lightdash/common';
import type { SessionUser } from '@lightdash/common';
import type { SessionData } from 'express-session';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import {
    getGithubUserAuthorizeUrl,
    getOrRefreshToken,
} from '../../clients/github/Github';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { GitUserCredentialsModel } from '../../models/GitUserCredentials/GitUserCredentialsModel';
import type { UserModel } from '../../models/UserModel';
import { GithubAppService } from './GithubAppService';

const githubMocks = vi.hoisted(() => ({
    createToken: vi.fn(),
    listInstallations: vi.fn(),
}));

vi.mock('@octokit/rest', () => ({
    Octokit: class {
        apps = {
            listInstallationsForAuthenticatedUser:
                githubMocks.listInstallations,
        };
    },
}));

vi.mock('../../clients/github/Github', () => ({
    getGithubApp: () => ({ oauth: { createToken: githubMocks.createToken } }),
    getGithubUserAuthorizeUrl: vi
        .fn()
        .mockReturnValue('https://github.com/login/oauth/authorize'),
    getOrRefreshToken: vi.fn(),
}));

const organizationUuid = 'org-uuid';
const userFields = {
    userUuid: 'user-uuid',
    organizationUuid,
    organizationName: 'org',
    organizationCreatedAt: new Date(),
    role: OrganizationMemberRole.ADMIN,
};
const user = {
    ...userFields,
    ability: defineUserAbility(userFields, []),
} as SessionUser;

const projectDeveloper = {
    ...userFields,
    role: OrganizationMemberRole.MEMBER,
    ability: defineUserAbility(
        { ...userFields, role: OrganizationMemberRole.MEMBER },
        [
            {
                userUuid: userFields.userUuid,
                projectUuid: 'project-uuid',
                role: ProjectMemberRole.DEVELOPER,
                roleUuid: undefined,
            },
        ],
    ),
} as SessionUser;

const buildService = ({
    findCredential,
    deleteCredential = vi.fn(),
    updateTokens = vi.fn(),
}: {
    findCredential?: import('vitest').Mock;
    deleteCredential?: import('vitest').Mock;
    updateTokens?: import('vitest').Mock;
} = {}) =>
    new GithubAppService({
        githubAppInstallationsModel:
            {} as unknown as GithubAppInstallationsModel,
        gitUserCredentialsModel: {
            findCredential:
                findCredential ?? vi.fn().mockResolvedValue(undefined),
            deleteCredential,
            updateTokens,
        } as unknown as GitUserCredentialsModel,
        userModel: {} as unknown as UserModel,
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
    });

describe('GithubAppService', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('installCallback', () => {
        const buildOauth = (): SessionData['oauth'] => ({
            state: 'initial-state',
            inviteCode: user.userUuid,
            githubFlow: 'installation',
            returnTo: `${lightdashConfigMock.siteUrl}/generalSettings/integrations`,
        });

        beforeEach(() => {
            githubMocks.createToken.mockResolvedValue({
                authentication: {
                    token: 'test-token',
                    refreshToken: 'test-refresh-token',
                },
            });
            githubMocks.listInstallations.mockResolvedValue({
                data: { installations: [{ id: 123 }] },
            });
        });

        it('continues an update through OAuth and completes using the session installation', async () => {
            const service = buildService();
            const upsert = vi
                .spyOn(service, 'upsertInstallation')
                .mockResolvedValue();
            const oauth = buildOauth();
            const initialState = oauth.state;

            await expect(
                service.installCallback(
                    user,
                    oauth,
                    undefined,
                    initialState,
                    '123',
                    'update',
                ),
            ).resolves.toBe('https://github.com/login/oauth/authorize');

            expect(oauth.state).not.toBe(initialState);
            expect(getGithubUserAuthorizeUrl).toHaveBeenCalledWith(oauth.state);
            expect(githubMocks.createToken).not.toHaveBeenCalled();
            expect(githubMocks.listInstallations).not.toHaveBeenCalled();
            expect(upsert).not.toHaveBeenCalled();

            await expect(
                service.installCallback(user, oauth, 'test-code', oauth.state),
            ).resolves.toBe(oauth.returnTo);
            expect(githubMocks.listInstallations).toHaveBeenCalledWith({
                headers: { authorization: 'Bearer test-token' },
            });
            expect(upsert).toHaveBeenCalledWith(
                user.userUuid,
                '123',
                'test-token',
                'test-refresh-token',
            );
            expect(oauth.githubInstallation).toBeUndefined();
        });

        it('rejects the original state after starting the OAuth continuation', async () => {
            const service = buildService();
            const oauth = buildOauth();
            const initialState = oauth.state;
            await service.installCallback(
                user,
                oauth,
                undefined,
                initialState,
                '123',
                'update',
            );

            await expect(
                service.installCallback(user, oauth, 'test-code', initialState),
            ).rejects.toThrow('State does not match');
            expect(githubMocks.createToken).not.toHaveBeenCalled();
            expect(oauth.githubInstallation).toBeDefined();
        });

        it.each([
            [
                'another user',
                { ...user, userUuid: 'another-user' },
                'User does not match',
            ],
            [
                'another organization',
                { ...user, organizationUuid: 'another-org' },
                'Organization does not match',
            ],
        ])(
            'rejects a continuation from %s',
            async (_scenario, changedUser, message) => {
                const service = buildService();
                const oauth = buildOauth();
                await service.installCallback(
                    user,
                    oauth,
                    undefined,
                    oauth.state,
                    '123',
                    'update',
                );

                await expect(
                    service.installCallback(
                        changedUser,
                        oauth,
                        'test-code',
                        oauth.state,
                    ),
                ).rejects.toThrow(message);
                expect(githubMocks.createToken).not.toHaveBeenCalled();
            },
        );

        it('rejects an installation inaccessible to the authorizing GitHub user', async () => {
            const service = buildService();
            const upsert = vi
                .spyOn(service, 'upsertInstallation')
                .mockResolvedValue();
            const oauth = buildOauth();
            await service.installCallback(
                user,
                oauth,
                undefined,
                oauth.state,
                '456',
                'update',
            );

            await expect(
                service.installCallback(
                    user,
                    oauth,
                    'test-code',
                    oauth.state,
                    '123',
                ),
            ).rejects.toThrow('Invalid installation id');
            expect(upsert).not.toHaveBeenCalled();
            expect(oauth.githubInstallation).toBeUndefined();
        });

        it('rejects an update started by a user without organization update permission', async () => {
            const service = buildService();
            const oauth = buildOauth();

            await expect(
                service.installCallback(
                    projectDeveloper,
                    oauth,
                    undefined,
                    oauth.state,
                    '123',
                    'update',
                ),
            ).rejects.toThrow(new ForbiddenError().message);
            expect(getGithubUserAuthorizeUrl).not.toHaveBeenCalled();
            expect(oauth.githubInstallation).toBeUndefined();
        });

        it('still completes a combined installation and authorization callback', async () => {
            const service = buildService();
            const upsert = vi
                .spyOn(service, 'upsertInstallation')
                .mockResolvedValue();
            const oauth = buildOauth();

            await expect(
                service.installCallback(
                    user,
                    oauth,
                    'test-code',
                    oauth.state,
                    '123',
                    'install',
                ),
            ).resolves.toBe(oauth.returnTo);
            expect(upsert).toHaveBeenCalledWith(
                user.userUuid,
                '123',
                'test-token',
                'test-refresh-token',
            );
        });

        it('does not redirect repeatedly when the OAuth continuation returns without a code', async () => {
            const service = buildService();
            const oauth = buildOauth();
            await service.installCallback(
                user,
                oauth,
                undefined,
                oauth.state,
                '123',
                'update',
            );

            await expect(
                service.installCallback(
                    user,
                    oauth,
                    undefined,
                    oauth.state,
                    '123',
                    'update',
                ),
            ).rejects.toThrow('Code not provided');
            expect(getGithubUserAuthorizeUrl).toHaveBeenCalledTimes(1);
        });

        it('keeps an administrator approval request pending until GitHub exposes the installation', async () => {
            const track = vi.spyOn(analyticsMock, 'track');
            vi.useFakeTimers();
            try {
                const service = buildService();
                const upsert = vi
                    .spyOn(service, 'upsertInstallation')
                    .mockResolvedValue();
                const oauth = buildOauth();
                githubMocks.listInstallations
                    .mockResolvedValueOnce({ data: { installations: [] } })
                    .mockResolvedValueOnce({
                        data: { installations: [{ id: 123 }] },
                    });

                await expect(
                    service.installCallback(
                        user,
                        oauth,
                        'test-code',
                        oauth.state,
                        undefined,
                        'request',
                    ),
                ).resolves.toBe(`${oauth.returnTo}?status=github_request_sent`);
                expect(upsert).not.toHaveBeenCalled();

                await vi.advanceTimersByTimeAsync(60_000);
                expect(upsert).not.toHaveBeenCalled();
                await vi.advanceTimersByTimeAsync(60_000);
                expect(upsert).toHaveBeenCalledWith(
                    user.userUuid,
                    '123',
                    'test-token',
                    'test-refresh-token',
                );
                expect(vi.getTimerCount()).toBe(0);
                expect(track).toHaveBeenCalledWith(
                    expect.objectContaining({
                        event: 'github_install.completed',
                        properties: {
                            organizationId: organizationUuid,
                            byAdmin: false,
                        },
                    }),
                );
            } finally {
                track.mockRestore();
                vi.useRealTimers();
            }
        });
    });

    describe('getRepos', () => {
        it('rejects a project developer who cannot manage the organization Git integration', async () => {
            const service = buildService();

            await expect(service.getRepos(projectDeveloper)).rejects.toThrow(
                ForbiddenError,
            );
        });
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
        it('reports personal attribution with the linked login when a credential exists', async () => {
            const service = buildService({
                findCredential: vi.fn().mockResolvedValue({
                    providerLogin: 'octocat',
                    token: 't',
                    refreshToken: 'r',
                }),
            });

            const attribution = await service.getAiWritebackAttribution(user);

            expect(attribution).toEqual({
                mode: 'personal',
                githubLogin: 'octocat',
            });
        });

        it('reports org/canLink:true when no credential is linked', async () => {
            const service = buildService({
                findCredential: vi.fn().mockResolvedValue(undefined),
            });

            const attribution = await service.getAiWritebackAttribution(user);

            expect(attribution).toEqual({ mode: 'org', canLink: true });
        });

        it('throws ForbiddenError when the caller cannot view their organization', async () => {
            const findCredential = vi.fn();
            const service = buildService({
                findCredential,
            });
            // Ability scoped to a different org → cannot view this org.
            const otherOrgUser = {
                ...userFields,
                ability: defineUserAbility(
                    { ...userFields, organizationUuid: 'another-org-uuid' },
                    [],
                ),
            } as SessionUser;

            await expect(
                service.getAiWritebackAttribution(otherOrgUser),
            ).rejects.toThrow(ForbiddenError);
            expect(findCredential).not.toHaveBeenCalled();
        });
    });

    describe('getValidUserToken (credential retention on refresh failure)', () => {
        const credential = {
            token: 'old-token',
            refreshToken: 'refresh-token',
        };

        it('keeps the credential on a transient refresh failure', async () => {
            const deleteCredential = vi.fn();
            const service = buildService({
                findCredential: vi.fn().mockResolvedValue(credential),
                deleteCredential,
            });
            (getOrRefreshToken as import('vitest').Mock).mockRejectedValue(
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
            const deleteCredential = vi.fn();
            const service = buildService({
                findCredential: vi.fn().mockResolvedValue(credential),
                deleteCredential,
            });
            (getOrRefreshToken as import('vitest').Mock).mockRejectedValue(
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
