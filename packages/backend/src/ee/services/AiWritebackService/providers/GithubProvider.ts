// Strategy methods implement the GitProvider contract; some don't reference
// `this`, which is fine for a stateless host wrapper.
/* eslint-disable class-methods-use-this */
import {
    getErrorMessage,
    ParameterError,
    PullRequestProvider,
    UnexpectedServerError,
    type DbtProjectConfig,
    type SessionUser,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import type { Sandbox } from 'e2b';
import type { Logger } from 'winston';
import {
    createBranch,
    createPullRequest,
    createSignedCommitOnBranch,
    getAppBotIdentity,
    getBranchHeadSha,
    getInstallationToken,
    getPullRequest,
    updatePullRequest,
    userTokenHasRepoAccess,
} from '../../../../clients/github/Github';
import type { GithubAppInstallationsModel } from '../../../../models/GithubAppInstallations/GithubAppInstallationsModel';
import type { GithubAppService } from '../../../../services/GithubAppService/GithubAppService';
import {
    CO_AUTHOR_TRAILER,
    COMMIT_AUTHOR_EMAIL,
    COMMIT_AUTHOR_NAME,
    CWD,
} from '../constants';
import { WritebackGitNotConnectedError } from '../errors';
import type {
    AdoptedPullRequest,
    CloneTarget,
    GitCommitAuthor,
    GitConnection,
    GithubConnection,
    GithubInstallation,
    GitInstallation,
    SetStage,
} from '../types';
import {
    buildCloneTarget,
    buildCoAuthorTrailer,
    buildUserCoAuthorTrailer,
    parseGithubConnection,
    parsePullNumber,
    parsePullRequestUrl,
} from '../utils';
import type {
    AdoptPullRequestArgs,
    GitProvider,
    LandedCommit,
    OpenPullRequestArgs,
    UpdatePullRequestArgs,
} from './GitProvider';
import {
    collectDiffStat,
    collectFileChanges,
    commitLocal,
    stageChanges,
} from './sandboxGit';

const asGithubConnection = (connection: GitConnection): GithubConnection => {
    if (connection.provider !== PullRequestProvider.GITHUB) {
        throw new UnexpectedServerError(
            'GithubProvider received a non-GitHub connection',
        );
    }
    return connection;
};

const asGithubInstallation = (
    installation: GitInstallation,
): GithubInstallation => {
    if (installation.provider !== PullRequestProvider.GITHUB) {
        throw new UnexpectedServerError(
            'GithubProvider received a non-GitHub installation',
        );
    }
    return installation;
};

// Route every GitHub API call (branch, commit, PR) through the triggering
// user's token when one was resolved — so the PR and its signed commits are
// authored as that user — otherwise act as the Lightdash GitHub App bot.
const githubAuth = (
    installation: GithubInstallation,
): { installationId: string } | { token: string } =>
    installation.userToken
        ? { token: installation.userToken }
        : { installationId: installation.installationId };

type GithubProviderDeps = {
    githubAppInstallationsModel: GithubAppInstallationsModel;
    githubAppService: GithubAppService;
    logger: Logger;
};

export class GithubProvider implements GitProvider {
    readonly provider = PullRequestProvider.GITHUB;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly githubAppService: GithubAppService;

    private readonly logger: Logger;

    constructor({
        githubAppInstallationsModel,
        githubAppService,
        logger,
    }: GithubProviderDeps) {
        this.githubAppInstallationsModel = githubAppInstallationsModel;
        this.githubAppService = githubAppService;
        this.logger = logger;
    }

    /**
     * Resolve the triggering user's user-to-server token when they have linked
     * their GitHub account (feature-flagged in getValidUserToken) and it can
     * reach the target repo. Returns null to fall back to bot auth — never
     * throws, so a missing/revoked link silently degrades to today's behaviour.
     */
    private async resolveUserToken(
        user: SessionUser | undefined,
        connection: GitConnection | undefined,
    ): Promise<string | null> {
        if (!user?.organizationUuid || !connection) {
            return null;
        }
        const github = asGithubConnection(connection);
        try {
            const userToken = await this.githubAppService.getValidUserToken(
                user.userUuid,
                user.organizationUuid,
            );
            if (
                userToken &&
                (await userTokenHasRepoAccess(
                    userToken,
                    github.owner,
                    github.repo,
                ))
            ) {
                return userToken;
            }
        } catch (error) {
            this.logger.warn(
                `AiWriteback: could not resolve a linked GitHub user token; falling back to the app bot. ${getErrorMessage(
                    error,
                )}`,
            );
        }
        return null;
    }

    resolveConnection(dbtConnection: DbtProjectConfig): GitConnection {
        return parseGithubConnection(dbtConnection);
    }

    getCloneTarget(
        connection: GitConnection,
        installation: GitInstallation,
    ): CloneTarget {
        // buildCloneTarget emits the `x-access-token` username GitHub expects.
        // Clone read-only with the user's token when acting as them, else the
        // installation token.
        const github = asGithubInstallation(installation);
        return buildCloneTarget(
            asGithubConnection(connection),
            github.userToken ?? github.token,
        );
    }

    /**
     * Resolve GitHub auth for the run. A GitHub App installation must exist —
     * the installation access token authenticates the (read-only) in-sandbox
     * clone and is the fallback identity. When `options.user` has linked their
     * personal GitHub account (feature-flagged) and it can reach the repo, a
     * user-to-server token is also resolved: the PR is then opened — and its
     * commits signed — as that user. Otherwise commits/PR are authored as the
     * Lightdash GitHub App and the triggering user is credited as a commit
     * co-author. Throws only when no installation exists at all.
     */
    async resolveInstallation(
        organizationUuid: string,
        options?: { user?: SessionUser; connection?: GitConnection },
    ): Promise<GitInstallation> {
        const installationId =
            await this.githubAppInstallationsModel.findInstallationId(
                organizationUuid,
            );
        if (!installationId) {
            throw new WritebackGitNotConnectedError(
                PullRequestProvider.GITHUB,
                'GitHub App is not installed for this organization',
            );
        }
        const token = await getInstallationToken(installationId);

        const userToken = await this.resolveUserToken(
            options?.user,
            options?.connection,
        );

        const commitAuthor: GitCommitAuthor = {
            name: COMMIT_AUTHOR_NAME,
            email: COMMIT_AUTHOR_EMAIL,
        };

        let coAuthorTrailer = CO_AUTHOR_TRAILER;
        try {
            const bot = await getAppBotIdentity(installationId);
            coAuthorTrailer = buildCoAuthorTrailer(bot);
        } catch (error) {
            this.logger.warn(
                `AiWriteback: could not resolve GitHub app bot identity for the co-author trailer; using the default. ${getErrorMessage(
                    error,
                )}`,
            );
        }

        return {
            provider: PullRequestProvider.GITHUB,
            installationId,
            token,
            userToken,
            commitAuthor,
            coAuthorTrailer,
        };
    }

    async openPullRequest(
        args: OpenPullRequestArgs,
    ): Promise<{ prUrl: string } & LandedCommit> {
        const { sandbox, title, description, user, setStage } = args;
        const connection = asGithubConnection(args.connection);
        const installation = asGithubInstallation(args.installation);
        const auth = githubAuth(installation);

        // The current branch right after clone is the default branch — that
        // becomes the PR base. Capture it before we branch off.
        const baseBranch =
            (await sandbox.git.status(CWD)).currentBranch ?? 'main';

        const branch = `lightdash-ai-writeback/${randomUUID()}`;

        // Create the feature branch on the remote at the base tip, then commit
        // onto it via the API so the commit is signed/verified.
        const baseOid = await getBranchHeadSha({
            owner: connection.owner,
            repo: connection.repo,
            branch: baseBranch,
            ...auth,
        });
        await createBranch({
            owner: connection.owner,
            repo: connection.repo,
            sha: baseOid,
            branch,
            ...auth,
        });
        await sandbox.git.createBranch(CWD, branch);

        const landed = await this.commitChangesToBranch({
            sandbox,
            connection,
            installation,
            branch,
            expectedHeadOid: baseOid,
            title,
            description,
            user,
            setStage,
            denyCiPaths: args.denyCiPaths,
        });

        setStage('pull_request');
        const pr = await createPullRequest({
            owner: connection.owner,
            repo: connection.repo,
            title,
            body: description,
            head: branch,
            base: baseBranch,
            ...auth,
        });
        return { prUrl: pr.html_url, ...landed };
    }

    async updatePullRequest(
        args: UpdatePullRequestArgs,
    ): Promise<LandedCommit> {
        const { sandbox, prUrl, title, description, user, setStage } = args;
        const connection = asGithubConnection(args.connection);
        const installation = asGithubInstallation(args.installation);
        const auth = githubAuth(installation);

        // The sandbox is on the PR's branch (resumed, or freshly checked out for
        // a pasted link). Commit this turn's edits onto it via the API (signed)
        // using the branch's current remote tip as expectedHeadOid.
        const featureBranch = (await sandbox.git.status(CWD)).currentBranch;
        if (!featureBranch) {
            throw new ParameterError(
                'Cannot update pull request: the sandbox is not on a feature branch',
            );
        }
        const expectedHeadOid = await getBranchHeadSha({
            owner: connection.owner,
            repo: connection.repo,
            branch: featureBranch,
            ...auth,
        });

        const landed = await this.commitChangesToBranch({
            sandbox,
            connection,
            installation,
            branch: featureBranch,
            expectedHeadOid,
            title,
            description,
            user,
            setStage,
            denyCiPaths: args.denyCiPaths,
        });

        setStage('pull_request');
        await updatePullRequest({
            owner: connection.owner,
            repo: connection.repo,
            pullNumber: parsePullNumber(prUrl),
            title,
            body: description,
            ...auth,
        });
        return landed;
    }

    async getPullRequestEditState(args: {
        prUrl: string;
        connection: GitConnection;
        installation: GitInstallation;
    }): Promise<{ editable: boolean; reason: 'merged' | 'closed' | null }> {
        const connection = asGithubConnection(args.connection);
        const installation = asGithubInstallation(args.installation);
        const parsed = parsePullRequestUrl(args.prUrl);
        const pr = await getPullRequest({
            owner: connection.owner,
            repo: connection.repo,
            pullNumber: parsed.pullNumber,
            ...githubAuth(installation),
        });
        if (pr.merged) {
            return { editable: false, reason: 'merged' };
        }
        if (pr.state === 'closed') {
            return { editable: false, reason: 'closed' };
        }
        return { editable: true, reason: null };
    }

    async adoptPullRequest(
        args: AdoptPullRequestArgs,
    ): Promise<AdoptedPullRequest> {
        const connection = asGithubConnection(args.connection);
        const installation = asGithubInstallation(args.installation);
        const parsed = parsePullRequestUrl(args.prUrl);

        const projectRepo = `${connection.owner}/${connection.repo}`;
        const pastedRepo = `${parsed.owner}/${parsed.repo}`;
        if (pastedRepo.toLowerCase() !== projectRepo.toLowerCase()) {
            throw new ParameterError(
                `Pull request ${pastedRepo}#${parsed.pullNumber} is in a different repository than this project's dbt repo (${projectRepo}). I can only edit pull requests in the project's own repository.`,
            );
        }

        const pr = await getPullRequest({
            owner: connection.owner,
            repo: connection.repo,
            pullNumber: parsed.pullNumber,
            ...githubAuth(installation),
        });

        if (pr.merged) {
            throw new ParameterError(
                `Pull request #${parsed.pullNumber} is already merged, so it can't be edited. Ask me to open a new one instead.`,
            );
        }
        if (pr.state === 'closed') {
            throw new ParameterError(
                `Pull request #${parsed.pullNumber} is closed, so it can't be edited. Reopen it or ask me to open a new one.`,
            );
        }
        if (
            !pr.headRepoFullName ||
            pr.headRepoFullName.toLowerCase() !== projectRepo.toLowerCase()
        ) {
            throw new ParameterError(
                `Pull request #${parsed.pullNumber} is from a fork (${
                    pr.headRepoFullName ?? 'unknown repository'
                }); I can only edit pull requests whose branch lives in ${projectRepo}.`,
            );
        }

        return {
            prUrl: `https://github.com/${projectRepo}/pull/${parsed.pullNumber}`,
            owner: connection.owner,
            repo: connection.repo,
            pullNumber: parsed.pullNumber,
            headRef: pr.headRef,
        };
    }

    /**
     * Stage the agent's edits and commit them to `branch` via the GitHub API so
     * the commit is signed/verified and authored by the Lightdash GitHub App. A
     * local commit is also made — never pushed — purely to advance the sandbox
     * HEAD so a subsequent resume turn's staged diff contains only that turn's
     * edits. The triggering user is credited as a `Co-authored-by:` trailer
     * (alongside the app-bot trailer) since the PR is opened by the app.
     *
     * Returns the new commit's SHA (the GraphQL mutation's `oid`) and this
     * turn's staged line stat, so the card can pin CI to exactly this commit and
     * show its diff stat.
     */
    private async commitChangesToBranch({
        sandbox,
        connection,
        installation,
        branch,
        expectedHeadOid,
        title,
        description,
        user,
        setStage,
        denyCiPaths,
    }: {
        sandbox: Sandbox;
        connection: GithubConnection;
        installation: GithubInstallation;
        branch: string;
        expectedHeadOid: string;
        title: string;
        description: string;
        user: SessionUser;
        setStage: SetStage;
        denyCiPaths: boolean;
    }): Promise<LandedCommit> {
        setStage('commit');
        await stageChanges(sandbox, connection.projectSubPath, this.logger);
        const fileChanges = await collectFileChanges(sandbox, { denyCiPaths });
        // Read the line stat while the change is still staged — the local commit
        // below clears the index.
        const diffStat = await collectDiffStat(sandbox);
        await commitLocal(sandbox, title, installation.commitAuthor);

        setStage('push');
        // When acting as the user (their token signs the commit), the commit is
        // already authored by them — no co-author trailer. Otherwise the commit
        // is the app bot's, so credit both the bot and the triggering user.
        let body: string;
        if (installation.userToken) {
            body = description;
        } else {
            const userTrailer = buildUserCoAuthorTrailer(user);
            const coAuthorTrailer = userTrailer
                ? `${installation.coAuthorTrailer}\n${userTrailer}`
                : installation.coAuthorTrailer;
            body = description
                ? `${description}\n\n${coAuthorTrailer}`
                : coAuthorTrailer;
        }
        const commit = await createSignedCommitOnBranch({
            owner: connection.owner,
            repo: connection.repo,
            branch,
            expectedHeadOid,
            headline: title,
            body,
            fileChanges,
            ...githubAuth(installation),
        });
        return { commitSha: commit.oid, ...diffStat };
    }
}
