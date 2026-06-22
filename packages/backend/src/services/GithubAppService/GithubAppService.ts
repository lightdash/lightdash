import { subject } from '@casl/ability';
import {
    AiWritebackAttribution,
    AuthorizationError,
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    GithubUserCredential,
    isUserWithOrg,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    PullRequestProvider,
    SessionUser,
    UnexpectedGitError,
} from '@lightdash/common';
import { Octokit as OctokitRest } from '@octokit/rest';
import { SessionData } from 'express-session';
import { nanoid } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import {
    createRepository as createGithubRepository,
    getAuthenticatedUser,
    getGithubApp,
    getGithubUserAuthorizeUrl,
    getOctokitRestForApp,
    getOrRefreshToken,
} from '../../clients/github/Github';
import { LightdashConfig } from '../../config/parseConfig';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { GitUserCredentialsModel } from '../../models/GitUserCredentials/GitUserCredentialsModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';
import { FeatureFlagService } from '../FeatureFlag/FeatureFlagService';

/**
 * GitHub OAuth error codes that mean the stored refresh token is no longer
 * usable (the user revoked the grant, or it was reset). Only these — plus a
 * 401 — should trigger deleting the credential; everything else is treated as
 * transient so a temporary outage doesn't silently unlink the user.
 */
const REVOKED_GITHUB_TOKEN_OAUTH_ERRORS = new Set([
    'bad_refresh_token',
    'invalid_grant',
    'unauthorized',
]);

const isRevokedGithubTokenError = (error: unknown): boolean => {
    if (typeof error !== 'object' || error === null) {
        return false;
    }
    const maybeError = error as {
        status?: number;
        response?: { status?: number; data?: { error?: string } };
    };
    const oauthError = maybeError.response?.data?.error;
    if (oauthError && REVOKED_GITHUB_TOKEN_OAUTH_ERRORS.has(oauthError)) {
        return true;
    }
    const status = maybeError.status ?? maybeError.response?.status;
    return status === 401;
};

type GithubAppServiceArguments = {
    githubAppInstallationsModel: GithubAppInstallationsModel;
    gitUserCredentialsModel: GitUserCredentialsModel;
    userModel: UserModel;
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    featureFlagService: FeatureFlagService;
};

export class GithubAppService extends BaseService {
    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly gitUserCredentialsModel: GitUserCredentialsModel;

    private readonly userModel: UserModel;

    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly featureFlagService: FeatureFlagService;

    constructor(args: GithubAppServiceArguments) {
        super();
        this.githubAppInstallationsModel = args.githubAppInstallationsModel;
        this.gitUserCredentialsModel = args.gitUserCredentialsModel;
        this.userModel = args.userModel;
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.featureFlagService = args.featureFlagService;
    }

    private async isUserCredentialsFeatureEnabled(
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<boolean> {
        const flag = await this.featureFlagService.get({
            user: {
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
            },
            featureFlagId: FeatureFlags.GithubUserCredentials,
        });
        return flag.enabled;
    }

    async installRedirect(user: SessionUser) {
        this.analytics.track({
            event: 'github_install.started',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid!,
            },
        });

        const returnToUrl = new URL(
            '/generalSettings/integrations',
            this.lightdashConfig.siteUrl,
        );
        const randomID = nanoid().replace('_', ''); // we use _ as separator, don't allow this character on the nanoid
        const subdomain = this.lightdashConfig.github.redirectDomain;
        const state = `${subdomain}_${randomID}`;
        const githubAppName = this.lightdashConfig.github.appName;

        return {
            installUrl: `https://github.com/apps/${githubAppName}/installations/new?state=${state}`,
            returnToUrl: returnToUrl.href,
            state,
            githubAppName,
            inviteCode: user.userUuid,
        };
    }

    async installCallback(
        user: SessionUser,
        oauth: SessionData['oauth'],
        code?: string,
        state?: string,
        installation_id?: string,
        setup_action?: string,
    ) {
        try {
            if (!state || state !== oauth?.state) {
                throw new AuthorizationError('State does not match');
            }

            const userUuid = oauth.inviteCode;
            if (!userUuid) {
                throw new ParameterError('User uuid not provided');
            }

            if (!code) {
                throw new ParameterError('Code not provided');
            }
            const userToServerToken = await getGithubApp().oauth.createToken({
                code,
            });

            const { token, refreshToken } = userToServerToken.authentication;
            if (refreshToken === undefined)
                throw new ForbiddenError('Invalid authentication token');

            const redirectUrl = new URL(oauth?.returnTo || '/');

            if (setup_action === 'request') {
                // User attempted to setup the app, didn't have permission in GitHub and sent a request to the admins
                // We will try to poll for the installation id
                console.info(
                    'Waiting for Github app to be authorized by an admin',
                );

                const interval = setInterval(async () => {
                    const response =
                        await new OctokitRest().apps.listInstallationsForAuthenticatedUser(
                            {
                                headers: {
                                    authorization: `Bearer ${token}`,
                                },
                            },
                        );
                    const { installations } = response.data;
                    if (installations.length > 0) {
                        const installationId = installations[0].id.toString();

                        console.info(
                            `Finishing Github authorized installation ${installationId}`,
                        );
                        await this.upsertInstallation(
                            userUuid,
                            installationId,
                            token,
                            refreshToken,
                        );

                        this.analytics.track({
                            event: 'github_install.completed',
                            userId: user.userUuid,
                            properties: {
                                organizationId: user.organizationUuid!,
                                byAdmin: false,
                            },
                        });

                        clearInterval(interval);
                    }
                }, 1000 * 60);

                return `${redirectUrl.href}?status=github_request_sent`;
            }

            if (!installation_id) {
                throw new ParameterError('Installation id not provided');
            }
            // Verify installation
            const response =
                await new OctokitRest().apps.listInstallationsForAuthenticatedUser(
                    {
                        headers: {
                            authorization: `Bearer ${token}`,
                        },
                    },
                );
            const installation = response.data.installations.find(
                (i) => `${i.id}` === installation_id,
            );
            if (installation === undefined)
                throw new ParameterError('Invalid installation id');

            await this.upsertInstallation(
                userUuid,
                installation_id,
                token,
                refreshToken,
            );

            this.analytics.track({
                event: 'github_install.completed',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid!,
                    byAdmin: true,
                },
            });

            return redirectUrl.href;
        } catch (error) {
            this.analytics.track({
                event: 'github_install.error',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid!,
                    byAdmin: setup_action !== 'request',
                    error: getErrorMessage(error),
                },
            });

            throw new UnexpectedGitError(getErrorMessage(error));
        }
    }

    async getInstallationId(user: SessionUser) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        // This endpoint is also used for developers on projects
        // when using the sql runner, so we should allow access
        // However github app is an organization property, so we can't check projects
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.githubAppInstallationsModel.getInstallationId(
            user.organizationUuid,
        );
    }

    async upsertInstallation(
        userUuid: string,
        installationId: string,
        token: string,
        refreshToken: string,
    ) {
        const user = await this.userModel.findSessionUserByUUID(userUuid);

        if (!user || !isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                    metadata: { installationId },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const currentInstallationId =
            await this.githubAppInstallationsModel.findInstallationId(
                user.organizationUuid,
            );
        if (currentInstallationId) {
            await this.githubAppInstallationsModel.updateInstallation(
                user,
                installationId,
            );
        } else {
            await this.githubAppInstallationsModel.createInstallation(
                user,
                installationId,
                token,
                refreshToken,
            );
        }
    }

    async deleteAppInstallation(user: SessionUser) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        // Permissions are checked on this.getInstallationId
        try {
            const installationId = await this.getInstallationId(user);
            const appOctokit = getOctokitRestForApp(installationId!);
            await appOctokit.apps.deleteInstallation({
                installation_id: parseInt(installationId!, 10),
            });
        } catch (error) {
            console.error('Github api error when uninstalling app', error);
        }

        return this.githubAppInstallationsModel.deleteInstallation(
            user.organizationUuid,
        );
    }

    async getRepos(user: SessionUser) {
        // Permissions are checked on this.getInstallationId
        const installationId = await this.getInstallationId(user);

        if (installationId === undefined)
            throw new NotFoundError('Missing Github installation');
        const appOctokit = getOctokitRestForApp(installationId);

        try {
            // Use pagination to fetch all repositories (default is only 30 per page)
            // The paginate helper automatically handles the repositories array from the response
            const repositories = await appOctokit.paginate(
                'GET /installation/repositories',
                { per_page: 100 },
            );
            return repositories.map((repo) => ({
                name: repo.name,
                ownerLogin: repo.owner.login,
                fullName: repo.full_name,
                defaultBranch: repo.default_branch,
            }));
        } catch (error) {
            console.error('Github api error', error);
            throw new MissingConfigError('Invalid Github integration config');
        }
    }

    async createRepository(
        user: SessionUser,
        name: string,
        description?: string,
        isPrivate?: boolean,
    ): Promise<{
        owner: string;
        repo: string;
        fullName: string;
        defaultBranch: string;
    }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('GitIntegration', {
                    organizationUuid: user.organizationUuid,
                    metadata: { repoName: name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Validate repository name according to GitHub's rules:
        // - 1-100 characters
        // - Only alphanumeric, hyphens, underscores, and periods
        // - Cannot start with a period
        // - Cannot end with .git
        // - Cannot be . or ..
        const repoNameRegex = /^(?!\.)(?!.*\.git$)[a-zA-Z0-9._-]{1,100}$/;
        if (!repoNameRegex.test(name) || name === '.' || name === '..') {
            throw new ParameterError(
                'Invalid repository name. Names must be 1-100 characters, contain only alphanumeric characters, hyphens, underscores, and periods, cannot start with a period, and cannot end with .git',
            );
        }

        const installationId = await this.getInstallationId(user);
        if (!installationId) {
            throw new NotFoundError(
                'GitHub App is not installed for this organization',
            );
        }

        this.analytics.track({
            event: 'github_repo.created',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid,
                repoName: name,
            },
        });

        return createGithubRepository({
            installationId,
            name,
            description,
            isPrivate,
        });
    }

    /**
     * Coerce a caller-supplied return path into a safe same-origin relative
     * path. Rejects absolute URLs and protocol-relative (`//host`) values so a
     * malicious `returnTo` cannot turn the post-OAuth redirect into an open
     * redirect. Falls back to the integrations settings page.
     */
    private toSameOriginPath(returnToPath?: string): string {
        const fallback = '/generalSettings/integrations';
        if (
            !returnToPath ||
            !returnToPath.startsWith('/') ||
            returnToPath.startsWith('//')
        ) {
            return fallback;
        }
        try {
            const candidate = new URL(
                returnToPath,
                this.lightdashConfig.siteUrl,
            );
            const siteOrigin = new URL(this.lightdashConfig.siteUrl).origin;
            // Reject anything that resolved to another origin (e.g. backslash
            // tricks that browsers normalise to `//host`).
            if (candidate.origin !== siteOrigin) {
                return fallback;
            }
            return `${candidate.pathname}${candidate.search}${candidate.hash}`;
        } catch {
            return fallback;
        }
    }

    /**
     * Build the redirect for linking a user's personal GitHub account.
     * Reuses the GitHub App's OAuth client and callback URL; the flow is
     * disambiguated from app installation via the session's githubFlow flag.
     */
    async linkUserRedirect(user: SessionUser, returnToPath?: string) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (!(await this.isUserCredentialsFeatureEnabled(user))) {
            throw new ForbiddenError(
                'Linking personal GitHub accounts is not enabled',
            );
        }

        this.analytics.track({
            event: 'github_user_link.started',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid,
            },
        });

        const returnToUrl = new URL(
            this.toSameOriginPath(returnToPath),
            this.lightdashConfig.siteUrl,
        );
        const randomID = nanoid().replace('_', '');
        const subdomain = this.lightdashConfig.github.redirectDomain;
        const state = `${subdomain}_${randomID}`;

        return {
            authorizeUrl: getGithubUserAuthorizeUrl(state),
            returnToUrl: returnToUrl.href,
            state,
        };
    }

    async linkUserCallback(
        user: SessionUser,
        oauth: SessionData['oauth'],
        code?: string,
        state?: string,
    ): Promise<string> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        try {
            if (!(await this.isUserCredentialsFeatureEnabled(user))) {
                throw new ForbiddenError(
                    'Linking personal GitHub accounts is not enabled',
                );
            }
            if (!state || state !== oauth?.state) {
                throw new AuthorizationError('State does not match');
            }
            if (!code) {
                throw new ParameterError('Code not provided');
            }

            const userToServerToken = await getGithubApp().oauth.createToken({
                code,
            });
            const { token, refreshToken } = userToServerToken.authentication;
            if (refreshToken === undefined) {
                throw new ForbiddenError('Invalid authentication token');
            }

            const githubUser = await getAuthenticatedUser(token);

            await this.gitUserCredentialsModel.upsertCredential({
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
                provider: PullRequestProvider.GITHUB,
                providerLogin: githubUser.login,
                providerUserId: `${githubUser.id}`,
                token,
                refreshToken,
            });

            this.analytics.track({
                event: 'github_user_link.completed',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid,
                },
            });

            const redirectUrl = new URL(
                oauth?.returnTo || '/',
                this.lightdashConfig.siteUrl,
            );
            return redirectUrl.href;
        } catch (error) {
            this.analytics.track({
                event: 'github_user_link.error',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid,
                    error: getErrorMessage(error),
                },
            });
            throw new UnexpectedGitError(getErrorMessage(error));
        }
    }

    async getUserCredential(
        user: SessionUser,
    ): Promise<GithubUserCredential | null> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        if (!(await this.isUserCredentialsFeatureEnabled(user))) {
            return null;
        }
        const credential = await this.gitUserCredentialsModel.findCredential(
            user.userUuid,
            user.organizationUuid,
            PullRequestProvider.GITHUB,
        );
        if (!credential) {
            return null;
        }
        return {
            githubLogin: credential.providerLogin,
            createdAt: credential.createdAt,
        };
    }

    /**
     * Cheap, advisory three-state signal of which GitHub identity an AI
     * writeback PR would be attributed to, for the AI agent's system prompt. A
     * single indexed credential lookup — no token refresh and no GitHub API
     * call — so it never blocks a chat turn. The authoritative resolution still
     * happens later in the writeback run (GithubProvider.resolveInstallation).
     *
     * Mirrors that resolution's gating: when the feature is disabled the
     * writeback-time path ignores any stored credential and falls back to the
     * org app, so we report `org`/`canLink: false` without even reading the
     * credential (and never nudge towards a hidden settings panel).
     */
    async getAiWritebackAttribution(
        user: SessionUser,
    ): Promise<AiWritebackAttribution> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        // Mirror getInstallationId: a self-scoped read of the caller's own
        // GitHub link + org installation, gated on viewing their organization.
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const canLink = await this.isUserCredentialsFeatureEnabled(user);
        if (!canLink) {
            return { mode: 'org', canLink: false };
        }
        const credential = await this.gitUserCredentialsModel.findCredential(
            user.userUuid,
            user.organizationUuid,
            PullRequestProvider.GITHUB,
        );
        if (credential) {
            return { mode: 'personal', githubLogin: credential.providerLogin };
        }
        return { mode: 'org', canLink: true };
    }

    // Intentionally NOT gated on the GithubUserCredentials feature flag: if an
    // org disables the flag after users have linked, those users must still be
    // able to revoke their stored token. Unlink only ever removes the caller's
    // own credential, so there is no exposure in leaving it always available.
    async unlinkUser(user: SessionUser): Promise<void> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const credential = await this.gitUserCredentialsModel.findCredential(
            user.userUuid,
            user.organizationUuid,
            PullRequestProvider.GITHUB,
        );
        if (!credential) {
            return;
        }

        try {
            await getGithubApp().oauth.deleteToken({
                token: credential.token,
            });
        } catch (error) {
            this.logger.warn(
                `Failed to revoke GitHub user token on unlink: ${getErrorMessage(
                    error,
                )}`,
            );
        }

        await this.gitUserCredentialsModel.deleteCredential(
            user.userUuid,
            user.organizationUuid,
            PullRequestProvider.GITHUB,
        );

        this.analytics.track({
            event: 'github_user_link.revoked',
            userId: user.userUuid,
            properties: {
                organizationId: user.organizationUuid,
            },
        });
    }

    /**
     * Resolve a valid user-to-server token for the user, refreshing and
     * persisting it when expired. Returns undefined when the user has no
     * linked account or the credential is no longer usable (e.g. revoked on
     * GitHub's side) — callers should fall back to the app installation.
     */
    async getValidUserToken(
        userUuid: string,
        organizationUuid: string,
    ): Promise<string | undefined> {
        if (
            !(await this.isUserCredentialsFeatureEnabled({
                userUuid,
                organizationUuid,
            }))
        ) {
            return undefined;
        }
        const credential = await this.gitUserCredentialsModel.findCredential(
            userUuid,
            organizationUuid,
            PullRequestProvider.GITHUB,
        );
        if (!credential) {
            return undefined;
        }

        try {
            const { token, refreshToken } = await getOrRefreshToken(
                credential.token,
                credential.refreshToken,
            );
            if (token !== credential.token) {
                await this.gitUserCredentialsModel.updateTokens(
                    userUuid,
                    organizationUuid,
                    PullRequestProvider.GITHUB,
                    token,
                    refreshToken,
                );
            }
            return token;
        } catch (error) {
            if (isRevokedGithubTokenError(error)) {
                this.logger.warn(
                    `GitHub user token for user ${userUuid} is revoked or invalid, removing credential: ${getErrorMessage(
                        error,
                    )}`,
                );
                await this.gitUserCredentialsModel.deleteCredential(
                    userUuid,
                    organizationUuid,
                    PullRequestProvider.GITHUB,
                );
                return undefined;
            }
            // Transient failure (network error, timeout, rate limit, GitHub
            // outage): keep the credential so a blip doesn't silently unlink
            // the user, and fall back to app auth for this request.
            this.logger.warn(
                `GitHub user token for user ${userUuid} could not be refreshed, falling back to app auth: ${getErrorMessage(
                    error,
                )}`,
            );
            return undefined;
        }
    }
}
