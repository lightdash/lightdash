import { subject } from '@casl/ability';
import {
    AuthorizationError,
    ForbiddenError,
    getErrorMessage,
    isUserWithOrg,
    NotFoundError,
    ParameterError,
    type JiraCreatedIssue,
    type JiraInstallation,
    type JiraIssueType,
    type JiraOAuthCredentials,
    type JiraProject,
    type JiraSite,
    type LightdashUserWithOrg,
    type SessionUser,
} from '@lightdash/common'; // pragma: allowlist secret
import { type SessionData } from 'express-session';
import { type Knex } from 'knex';
import { nanoid } from 'nanoid';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics'; // pragma: allowlist secret
import {
    createJiraIssue,
    exchangeJiraCodeForToken,
    getJiraAuthorizationUrl,
    getJiraIssueTypes,
    getJiraProjects,
    getJiraSites,
    linkJiraIssueUrl,
    refreshJiraToken,
} from '../../clients/jira/Jira';
import { type LightdashConfig } from '../../config/parseConfig'; // pragma: allowlist secret
import { type JiraAppInstallationsModel } from '../../models/JiraAppInstallations/JiraAppInstallationsModel';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { BaseService } from '../BaseService';

type Arguments = {
    jiraAppInstallationsModel: JiraAppInstallationsModel;
    encryptionUtil: EncryptionUtil;
    lightdashConfig: LightdashConfig; // pragma: allowlist secret
    analytics: LightdashAnalytics; // pragma: allowlist secret
    onWorkspaceChanged?: (
        organizationUuid: string,
        trx: Knex.Transaction,
    ) => Promise<void>;
    onInstallationDeleted?: (
        organizationUuid: string,
        trx: Knex.Transaction,
    ) => Promise<void>;
};

const MAX_CREDENTIAL_LENGTH = 255;

export class JiraAppService extends BaseService {
    private readonly model: JiraAppInstallationsModel;

    private readonly encryptionUtil: EncryptionUtil;

    private readonly config: LightdashConfig; // pragma: allowlist secret

    private readonly analytics: LightdashAnalytics; // pragma: allowlist secret

    private readonly onWorkspaceChanged: NonNullable<
        Arguments['onWorkspaceChanged']
    >;

    private readonly onInstallationDeleted: NonNullable<
        Arguments['onInstallationDeleted']
    >;

    constructor(args: Arguments) {
        super();
        this.model = args.jiraAppInstallationsModel;
        this.encryptionUtil = args.encryptionUtil;
        this.config = args.lightdashConfig;
        this.analytics = args.analytics;
        this.onWorkspaceChanged =
            args.onWorkspaceChanged ?? (() => Promise.resolve());
        this.onInstallationDeleted =
            args.onInstallationDeleted ?? (() => Promise.resolve());
    }

    private canManageOrg(
        user: SessionUser,
    ): asserts user is SessionUser & LightdashUserWithOrg {
        if (!isUserWithOrg(user))
            throw new Error('User is not part of an organization');
        if (
            !this.createAuditedAbility(user).can(
                'manage',
                subject('Organization', {
                    organizationUuid: user.organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'User does not have permission to manage organization',
            );
        }
    }

    private static validateCredentials(
        credentials: JiraOAuthCredentials,
    ): JiraOAuthCredentials {
        const clientId = credentials.clientId.trim();
        const clientSecret = credentials.clientSecret.trim();
        if (!clientId || clientId.length > MAX_CREDENTIAL_LENGTH) {
            throw new ParameterError('Jira OAuth client ID is invalid');
        }
        if (!clientSecret || clientSecret.length > MAX_CREDENTIAL_LENGTH) {
            throw new ParameterError('Jira OAuth client secret is invalid');
        }
        return { clientId, clientSecret };
    }

    private async getStoredCredentials(
        organizationUuid: string,
    ): Promise<JiraOAuthCredentials> {
        const { clientId, clientSecret } =
            await this.model.getAuth(organizationUuid);
        return { clientId, clientSecret };
    }

    private getRedirectUri() {
        return new URL(
            '/api/v1/jira/oauth/callback',
            this.config.siteUrl, // pragma: allowlist secret
        ).href;
    }

    async installRedirect(
        user: SessionUser,
        credentials: JiraOAuthCredentials | null,
    ) {
        this.canManageOrg(user);
        const { clientId, clientSecret } = credentials
            ? JiraAppService.validateCredentials(credentials)
            : await this.getStoredCredentials(user.organizationUuid);
        const state = nanoid();
        const redirectUri = this.getRedirectUri();
        this.analytics.track({
            event: 'jira_install.started',
            userId: user.userUuid,
            properties: { organizationId: user.organizationUuid },
        });
        return {
            installUrl: getJiraAuthorizationUrl(clientId, redirectUri, state),
            returnToUrl: new URL(
                '/generalSettings/ai/general',
                this.config.siteUrl, // pragma: allowlist secret
            ).href,
            state,
            jira: {
                redirectUri,
                clientId,
                // The secret round-trips through the session store, so never in plaintext
                encryptedClientSecret: this.encryptionUtil
                    .encrypt(clientSecret)
                    .toString('base64'),
            },
        };
    }

    async installCallback(
        user: SessionUser,
        oauth: SessionData['oauth'],
        code?: string,
        state?: string,
    ): Promise<string> {
        this.canManageOrg(user);
        try {
            if (!state || state !== oauth?.state) {
                throw new AuthorizationError('State does not match');
            }
            if (!code) throw new ParameterError('Code not provided');
            if (!oauth.jira) {
                throw new ParameterError('Jira OAuth session not found');
            }
            const { clientId, redirectUri } = oauth.jira;
            const clientSecret = this.encryptionUtil.decrypt(
                Buffer.from(oauth.jira.encryptedClientSecret, 'base64'),
            );
            const tokens = await exchangeJiraCodeForToken(
                code,
                clientId,
                clientSecret,
                redirectUri,
            );
            const sites = await getJiraSites(tokens.token);
            if (sites.length === 0) {
                throw new NotFoundError('No Jira sites are available');
            }
            const existing = await this.model.findInstallation(
                user.organizationUuid,
            );
            const previousSite = existing?.siteId
                ? (sites.find((site) => site.id === existing.siteId) ?? null)
                : null;
            const site = previousSite ?? (sites.length === 1 ? sites[0] : null);
            const workspaceChanged =
                existing?.siteId != null && existing.siteId !== site?.id;

            await this.model.transaction(async (trx) => {
                await this.model.upsertInstallation(
                    user,
                    { ...tokens, site, clientId, clientSecret },
                    trx,
                );
                if (workspaceChanged) {
                    await this.onWorkspaceChanged(user.organizationUuid, trx);
                }
            });
            this.analytics.track({
                event: 'jira_install.completed',
                userId: user.userUuid,
                properties: { organizationId: user.organizationUuid },
            });
            return new URL(
                oauth.returnTo ?? this.config.siteUrl, // pragma: allowlist secret
            ).href;
        } catch (error) {
            this.analytics.track({
                event: 'jira_install.error',
                userId: user.userUuid,
                properties: {
                    organizationId: user.organizationUuid,
                    error: getErrorMessage(error),
                },
            });
            throw error;
        }
    }

    async getInstallation(user: SessionUser): Promise<JiraInstallation> {
        this.canManageOrg(user);
        return this.model.getInstallation(user.organizationUuid);
    }

    async deleteAppInstallation(user: SessionUser): Promise<void> {
        this.canManageOrg(user);
        await this.model.transaction(async (trx) => {
            await this.model.deleteInstallation(user.organizationUuid, trx);
            await this.onInstallationDeleted(user.organizationUuid, trx);
        });
        this.analytics.track({
            event: 'jira_install.uninstalled',
            userId: user.userUuid,
            properties: { organizationId: user.organizationUuid },
        });
    }

    async getSites(user: SessionUser): Promise<JiraSite[]> {
        this.canManageOrg(user);
        return this.withValidToken(user.organizationUuid, (token) =>
            getJiraSites(token),
        );
    }

    async selectSite(
        user: SessionUser,
        siteId: string,
    ): Promise<JiraInstallation> {
        this.canManageOrg(user);
        const sites = await this.withValidToken(
            user.organizationUuid,
            (token) => getJiraSites(token),
        );
        const site = sites.find((candidate) => candidate.id === siteId);
        if (!site) throw new NotFoundError('Jira site not found');
        const current = await this.model.getInstallation(user.organizationUuid);
        await this.model.transaction(async (trx) => {
            await this.model.setSite(user.organizationUuid, site, trx);
            if (current.siteId !== site.id) {
                await this.onWorkspaceChanged(user.organizationUuid, trx);
            }
        });
        return this.model.getInstallation(user.organizationUuid);
    }

    async getProjects(user: SessionUser): Promise<JiraProject[]> {
        this.canManageOrg(user);
        return this.withSite(user.organizationUuid, (token, site) =>
            getJiraProjects(token, site.id),
        );
    }

    async getIssueTypes(
        user: SessionUser,
        projectId: string,
    ): Promise<JiraIssueType[]> {
        this.canManageOrg(user);
        return this.withSite(user.organizationUuid, (token, site) =>
            getJiraIssueTypes(token, site.id, projectId),
        );
    }

    async createIssueForOrganization(
        organizationUuid: string,
        input: {
            title: string;
            description: string;
            projectId: string;
            issueTypeId: string;
        },
    ): Promise<JiraCreatedIssue> {
        return this.withSite(organizationUuid, (token, site) =>
            createJiraIssue(token, site, input),
        );
    }

    async linkIssueUrlForOrganization(
        organizationUuid: string,
        input: { issueIdOrKey: string; url: string; title: string },
    ): Promise<void> {
        return this.withSite(organizationUuid, (token, site) =>
            linkJiraIssueUrl(token, site.id, input),
        );
    }

    private async withSite<T>(
        organizationUuid: string,
        run: (token: string, site: JiraSite) => Promise<T>,
    ): Promise<T> {
        const auth = await this.getValidAuth(organizationUuid);
        if (!auth.site) {
            throw new ParameterError('Select a Jira site before using Jira');
        }
        try {
            return await run(auth.token, auth.site);
        } catch (error) {
            if (!(error instanceof ForbiddenError)) throw error;
            const refreshed = await this.refreshAuth(organizationUuid, auth);
            return run(refreshed.token, refreshed.site ?? auth.site);
        }
    }

    private async withValidToken<T>(
        organizationUuid: string,
        run: (token: string) => Promise<T>,
    ): Promise<T> {
        const auth = await this.getValidAuth(organizationUuid);
        try {
            return await run(auth.token);
        } catch (error) {
            if (!(error instanceof ForbiddenError)) throw error;
            const refreshed = await this.refreshAuth(organizationUuid, auth);
            return run(refreshed.token);
        }
    }

    private async getValidAuth(organizationUuid: string) {
        const auth = await this.model.getAuth(organizationUuid);
        if (auth.expiresAt.getTime() > Date.now() + 30_000) return auth;
        return this.refreshAuth(organizationUuid, auth);
    }

    private async refreshAuth(
        organizationUuid: string,
        auth: Awaited<ReturnType<JiraAppInstallationsModel['getAuth']>>,
    ) {
        if (!auth.refreshToken) {
            throw new ForbiddenError('Jira connection must be renewed');
        }
        const refreshed = await refreshJiraToken(
            auth.refreshToken,
            auth.clientId,
            auth.clientSecret,
        );
        const next = {
            ...auth,
            ...refreshed,
            refreshToken: refreshed.refreshToken ?? auth.refreshToken,
        };
        await this.model.updateAuth(organizationUuid, next);
        return next;
    }
}
