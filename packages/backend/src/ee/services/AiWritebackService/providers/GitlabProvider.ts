// Strategy methods implement the GitProvider contract; some don't reference
// `this`, which is fine for a stateless host wrapper.
/* eslint-disable class-methods-use-this */
import {
    getErrorMessage,
    MissingConfigError,
    ParameterError,
    PullRequestProvider,
    UnexpectedServerError,
    type DbtProjectConfig,
    type SessionUser,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import type { Logger } from 'winston';
import {
    createPullRequest,
    getGitlabUser,
    getMergeRequest,
    getOrRefreshToken,
    updateMergeRequest,
} from '../../../../clients/gitlab/Gitlab';
import type { GitlabAppInstallationsModel } from '../../../../models/GitlabAppInstallations/GitlabAppInstallationsModel';
import type { SandboxHandle } from '../../SandboxRuntime';
import { COMMIT_AUTHOR_EMAIL, COMMIT_AUTHOR_NAME, CWD } from '../constants';
import { WritebackGitNotConnectedError } from '../errors';
import type {
    AdoptedPullRequest,
    CloneTarget,
    GitCommitAuthor,
    GitConnection,
    GitInstallation,
    GitlabConnection,
    GitlabInstallation,
    SetStage,
} from '../types';
import {
    buildCloneTarget,
    buildGitlabCommitAuthor,
    buildUserCoAuthorTrailer,
    parseGitlabConnection,
    parseMergeRequestUrl,
    parsePullNumber,
    type GitlabUserIdentity,
} from '../utils';
import type {
    AdoptPullRequestArgs,
    GitProvider,
    LandedCommit,
    OpenPullRequestArgs,
    UpdatePullRequestArgs,
} from './GitProvider';
import { collectDiffStat, commitLocal, stageChanges } from './sandboxGit';

const asGitlabConnection = (connection: GitConnection): GitlabConnection => {
    if (connection.provider !== PullRequestProvider.GITLAB) {
        throw new UnexpectedServerError(
            'GitlabProvider received a non-GitLab connection',
        );
    }
    return connection;
};

const asGitlabInstallation = (
    installation: GitInstallation,
): GitlabInstallation => {
    if (installation.provider !== PullRequestProvider.GITLAB) {
        throw new UnexpectedServerError(
            'GitlabProvider received a non-GitLab installation',
        );
    }
    return installation;
};

/**
 * The OAuth token is only valid against the instance it was issued by, and the
 * clone/MR API target the dbt repo's host. If those hosts differ (self-hosted
 * misconfiguration) the token is silently rejected as "Invalid GitLab access
 * token"; fail early with an actionable message instead.
 */
const assertSameHost = (
    connection: GitlabConnection,
    installation: GitlabInstallation,
): void => {
    const installHost = new URL(installation.instanceUrl).hostname;
    if (installHost !== connection.hostDomain) {
        throw new ParameterError(
            `This project's GitLab host (${connection.hostDomain}) does not match the connected GitLab app instance (${installHost}). Connect the GitLab app for ${connection.hostDomain}.`,
        );
    }
};

type GitlabConfig = {
    clientId: string | undefined;
    clientSecret: string | undefined;
};

type GitlabProviderDeps = {
    gitlabAppInstallationsModel: GitlabAppInstallationsModel;
    gitlabConfig: GitlabConfig;
    logger: Logger;
};

export class GitlabProvider implements GitProvider {
    readonly provider = PullRequestProvider.GITLAB;

    private readonly gitlabAppInstallationsModel: GitlabAppInstallationsModel;

    private readonly gitlabConfig: GitlabConfig;

    private readonly logger: Logger;

    constructor({
        gitlabAppInstallationsModel,
        gitlabConfig,
        logger,
    }: GitlabProviderDeps) {
        this.gitlabAppInstallationsModel = gitlabAppInstallationsModel;
        this.gitlabConfig = gitlabConfig;
        this.logger = logger;
    }

    resolveConnection(dbtConnection: DbtProjectConfig): GitConnection {
        return parseGitlabConnection(dbtConnection);
    }

    getCloneTarget(
        connection: GitConnection,
        installation: GitInstallation,
    ): CloneTarget {
        const gitlabConnection = asGitlabConnection(connection);
        const gitlabInstallation = asGitlabInstallation(installation);
        assertSameHost(gitlabConnection, gitlabInstallation);
        return buildCloneTarget(gitlabConnection, gitlabInstallation.token);
    }

    /**
     * Resolve the org's GitLab app-install OAuth token (refreshing it if stale)
     * plus the connected user's identity for the commit author. Throws when the
     * org has not connected the GitLab app, mirroring the GitHub path.
     */
    async resolveInstallation(
        organizationUuid: string,
        // Per-user GitLab account linking is not implemented yet; GitLab
        // writebacks always act as the org's app installation.
        _options?: { user?: SessionUser; connection?: GitConnection },
    ): Promise<GitInstallation> {
        let auth: {
            token: string;
            refreshToken: string;
            gitlabInstanceUrl: string;
        };
        try {
            auth =
                await this.gitlabAppInstallationsModel.getAuth(
                    organizationUuid,
                );
        } catch {
            throw new WritebackGitNotConnectedError(
                PullRequestProvider.GITLAB,
                'GitLab App is not installed for this organization',
            );
        }

        const { clientId, clientSecret } = this.gitlabConfig;
        if (!clientId || !clientSecret) {
            throw new MissingConfigError(
                'GitLab integration is not configured (GITLAB_CLIENT_ID / GITLAB_CLIENT_SECRET)',
            );
        }

        const refreshed = await getOrRefreshToken(
            auth.token,
            auth.refreshToken,
            clientId,
            clientSecret,
            auth.gitlabInstanceUrl,
        );
        if (refreshed.token !== auth.token) {
            await this.gitlabAppInstallationsModel.updateAuth(
                organizationUuid,
                refreshed.token,
                refreshed.refreshToken,
            );
        }

        let commitAuthor: GitCommitAuthor = {
            name: COMMIT_AUTHOR_NAME,
            email: COMMIT_AUTHOR_EMAIL,
        };
        try {
            const user = (await getGitlabUser(
                refreshed.token,
                auth.gitlabInstanceUrl,
            )) as GitlabUserIdentity;
            commitAuthor = buildGitlabCommitAuthor(
                user,
                new URL(auth.gitlabInstanceUrl).hostname,
            );
        } catch (error) {
            this.logger.warn(
                `AiWriteback: could not resolve GitLab user identity for org ${organizationUuid}; commits use the default author. ${getErrorMessage(
                    error,
                )}`,
            );
        }

        return {
            provider: PullRequestProvider.GITLAB,
            token: refreshed.token,
            instanceUrl: auth.gitlabInstanceUrl,
            commitAuthor,
        };
    }

    async openPullRequest(
        args: OpenPullRequestArgs,
    ): Promise<{ prUrl: string } & LandedCommit> {
        const { sandbox, title, description, user, setStage } = args;
        const connection = asGitlabConnection(args.connection);
        const installation = asGitlabInstallation(args.installation);

        // The current branch right after clone is the default branch — that
        // becomes the MR target. Capture it before we branch off.
        const baseBranch =
            (await sandbox.git.status(CWD)).currentBranch ?? 'main';
        const branch = `lightdash-ai-writeback/${randomUUID()}`;
        await sandbox.git.createBranch(CWD, branch);

        const landed = await this.landChanges({
            sandbox,
            connection,
            installation,
            branch,
            title,
            user,
            setStage,
        });

        setStage('pull_request');
        const mr = await createPullRequest({
            owner: connection.owner,
            repo: connection.repo,
            title,
            body: description,
            head: branch,
            base: baseBranch,
            token: installation.token,
            hostDomain: connection.hostDomain,
        });
        return { prUrl: mr.html_url, ...landed };
    }

    async updatePullRequest(
        args: UpdatePullRequestArgs,
    ): Promise<LandedCommit> {
        const { sandbox, prUrl, title, description, user, setStage } = args;
        const connection = asGitlabConnection(args.connection);
        const installation = asGitlabInstallation(args.installation);

        // The sandbox is on the MR's branch (resumed, or freshly checked out for
        // a pasted link). Commit this turn's edits onto it and push.
        const featureBranch = (await sandbox.git.status(CWD)).currentBranch;
        if (!featureBranch) {
            throw new ParameterError(
                'Cannot update merge request: the sandbox is not on a feature branch',
            );
        }

        const landed = await this.landChanges({
            sandbox,
            connection,
            installation,
            branch: featureBranch,
            title,
            user,
            setStage,
        });

        setStage('pull_request');
        await updateMergeRequest({
            owner: connection.owner,
            repo: connection.repo,
            iid: parsePullNumber(prUrl),
            title,
            description,
            token: installation.token,
            hostDomain: connection.hostDomain,
        });
        return landed;
    }

    async getPullRequestEditState(args: {
        prUrl: string;
        connection: GitConnection;
        installation: GitInstallation;
    }): Promise<{ editable: boolean; reason: 'merged' | 'closed' | null }> {
        const connection = asGitlabConnection(args.connection);
        const installation = asGitlabInstallation(args.installation);
        assertSameHost(connection, installation);
        const { mergeRequestIid } = parseMergeRequestUrl(
            args.prUrl,
            connection.hostDomain,
        );
        const mr = await getMergeRequest({
            owner: connection.owner,
            repo: connection.repo,
            iid: mergeRequestIid,
            token: installation.token,
            hostDomain: connection.hostDomain,
        });
        if (mr.merged) {
            return { editable: false, reason: 'merged' };
        }
        if (mr.state === 'closed') {
            return { editable: false, reason: 'closed' };
        }
        return { editable: true, reason: null };
    }

    async adoptPullRequest(
        args: AdoptPullRequestArgs,
    ): Promise<AdoptedPullRequest> {
        const connection = asGitlabConnection(args.connection);
        const installation = asGitlabInstallation(args.installation);
        assertSameHost(connection, installation);
        const { projectPath, mergeRequestIid } = parseMergeRequestUrl(
            args.prUrl,
            connection.hostDomain,
        );

        const projectRepo = `${connection.owner}/${connection.repo}`;
        if (projectPath.toLowerCase() !== projectRepo.toLowerCase()) {
            throw new ParameterError(
                `Merge request ${projectPath}!${mergeRequestIid} is in a different project than this project's dbt repo (${projectRepo}). I can only edit merge requests in the project's own repository.`,
            );
        }

        const mr = await getMergeRequest({
            owner: connection.owner,
            repo: connection.repo,
            iid: mergeRequestIid,
            token: installation.token,
            hostDomain: connection.hostDomain,
        });

        if (mr.merged) {
            throw new ParameterError(
                `Merge request !${mergeRequestIid} is already merged, so it can't be edited. Ask me to open a new one instead.`,
            );
        }
        if (mr.state === 'closed') {
            throw new ParameterError(
                `Merge request !${mergeRequestIid} is closed, so it can't be edited. Reopen it or ask me to open a new one.`,
            );
        }
        // Reject forks — and fail safe when the projects can't be determined
        // (parity with the GitHub path, which rejects an unknown head repo).
        if (
            mr.sourceProjectId === null ||
            mr.targetProjectId === null ||
            mr.sourceProjectId !== mr.targetProjectId
        ) {
            throw new ParameterError(
                `Merge request !${mergeRequestIid} is from a fork; I can only edit merge requests whose branch lives in ${projectRepo}.`,
            );
        }

        return {
            prUrl: mr.webUrl,
            owner: connection.owner,
            repo: connection.repo,
            pullNumber: mergeRequestIid,
            headRef: mr.sourceBranch,
        };
    }

    /**
     * Stage the agent's edits, commit them locally as the GitLab user (crediting
     * the triggering Lightdash user as a co-author), and push the branch over
     * HTTPS (`oauth2:<token>`). GitLab commits are unsigned — there is no
     * app-signing equivalent — which is accepted.
     *
     * Returns the pushed commit's SHA (read from the sandbox HEAD) and this
     * turn's staged line stat, so the card can pin the MR's CI checks to exactly
     * this commit and show its diff stat.
     */
    private async landChanges({
        sandbox,
        connection,
        installation,
        branch,
        title,
        user,
        setStage,
    }: {
        sandbox: SandboxHandle;
        connection: GitlabConnection;
        installation: GitlabInstallation;
        branch: string;
        title: string;
        user: SessionUser;
        setStage: SetStage;
    }): Promise<LandedCommit> {
        setStage('commit');
        await stageChanges(sandbox, connection.projectSubPath, this.logger);
        // Read the line stat while still staged — the local commit clears it.
        const diffStat = await collectDiffStat(sandbox);
        const userTrailer = buildUserCoAuthorTrailer(user);
        const message = userTrailer ? `${title}\n\n${userTrailer}` : title;
        await commitLocal(sandbox, message, installation.commitAuthor);

        setStage('push');
        await sandbox.git.push(CWD, {
            remote: 'origin',
            branch,
            username: 'oauth2',
            password: installation.token,
            setUpstream: true,
        });

        const { stdout } = await sandbox.commands.run(
            `git -C ${CWD} rev-parse HEAD`,
        );
        return { commitSha: stdout.trim(), ...diffStat };
    }
}
