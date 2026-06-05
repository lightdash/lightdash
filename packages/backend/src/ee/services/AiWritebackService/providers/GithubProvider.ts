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
} from '../../../../clients/github/Github';
import type { GithubAppInstallationsModel } from '../../../../models/GithubAppInstallations/GithubAppInstallationsModel';
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
    OpenPullRequestArgs,
    UpdatePullRequestArgs,
} from './GitProvider';
import { collectFileChanges, commitLocal, stageChanges } from './sandboxGit';

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

// The PR is always opened, and commits signed, as the Lightdash GitHub App
// installation — never a user OAuth token (which belongs to whoever connected
// the app, not whoever triggered the writeback).
const githubAuth = (
    installation: GithubInstallation,
): { installationId: string } => ({
    installationId: installation.installationId,
});

type GithubProviderDeps = {
    githubAppInstallationsModel: GithubAppInstallationsModel;
    logger: Logger;
};

export class GithubProvider implements GitProvider {
    readonly provider = PullRequestProvider.GITHUB;

    private readonly githubAppInstallationsModel: GithubAppInstallationsModel;

    private readonly logger: Logger;

    constructor({ githubAppInstallationsModel, logger }: GithubProviderDeps) {
        this.githubAppInstallationsModel = githubAppInstallationsModel;
        this.logger = logger;
    }

    resolveConnection(dbtConnection: DbtProjectConfig): GitConnection {
        return parseGithubConnection(dbtConnection);
    }

    getCloneTarget(
        connection: GitConnection,
        installation: GitInstallation,
    ): CloneTarget {
        // buildCloneTarget emits the `x-access-token` username GitHub expects.
        return buildCloneTarget(
            asGithubConnection(connection),
            asGithubInstallation(installation).token,
        );
    }

    /**
     * Resolve GitHub auth for the organization. The installation access token
     * authenticates the in-sandbox clone, and the pull request is opened — and
     * the signed commits authored — as the Lightdash GitHub App itself. We
     * deliberately do not attribute the PR to a GitHub user: the only user token
     * we hold belongs to whoever connected the app for the org, which is almost
     * never the person who triggered the writeback (e.g. via Slack). The
     * triggering user is credited as a commit co-author instead. Throws only
     * when no installation exists at all.
     */
    async resolveInstallation(
        organizationUuid: string,
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
            commitAuthor,
            coAuthorTrailer,
        };
    }

    async openPullRequest(args: OpenPullRequestArgs): Promise<string> {
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

        await this.commitChangesToBranch({
            sandbox,
            connection,
            installation,
            branch,
            expectedHeadOid: baseOid,
            title,
            description,
            user,
            setStage,
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
        return pr.html_url;
    }

    async updatePullRequest(args: UpdatePullRequestArgs): Promise<void> {
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

        await this.commitChangesToBranch({
            sandbox,
            connection,
            installation,
            branch: featureBranch,
            expectedHeadOid,
            title,
            description,
            user,
            setStage,
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
    }): Promise<void> {
        setStage('commit');
        await stageChanges(sandbox, connection.projectSubPath, this.logger);
        const fileChanges = await collectFileChanges(sandbox);
        await commitLocal(sandbox, title, installation.commitAuthor);

        setStage('push');
        const userTrailer = buildUserCoAuthorTrailer(user);
        const coAuthorTrailer = userTrailer
            ? `${installation.coAuthorTrailer}\n${userTrailer}`
            : installation.coAuthorTrailer;
        const body = description
            ? `${description}\n\n${coAuthorTrailer}`
            : coAuthorTrailer;
        await createSignedCommitOnBranch({
            owner: connection.owner,
            repo: connection.repo,
            branch,
            expectedHeadOid,
            headline: title,
            body,
            fileChanges,
            ...githubAuth(installation),
        });
    }
}
