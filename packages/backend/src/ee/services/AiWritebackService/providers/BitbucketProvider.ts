/* eslint-disable class-methods-use-this */
import { subject } from '@casl/ability';
import {
    DbtProjectType,
    ForbiddenError,
    ParameterError,
    PullRequestProvider,
    PullRequestState,
    UnexpectedGitError,
    type ClosePullRequestResult,
    type DbtProjectConfig,
    type SessionUser,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import type { Logger } from 'winston';
import * as BitbucketClient from '../../../../clients/bitbucket/Bitbucket';
import type { ProjectDbtSourcesModel } from '../../../../models/ProjectDbtSourcesModel';
import type { ProjectModel } from '../../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../../services/BaseService';
import { COMMIT_AUTHOR_EMAIL, COMMIT_AUTHOR_NAME, CWD } from '../constants';
import {
    WritebackCredentialCleanupError,
    WritebackGitNotConnectedError,
} from '../errors';
import type {
    AdoptedPullRequest,
    BitbucketConnection,
    BitbucketInstallation,
    CloneTarget,
    GitConnection,
    GitInstallation,
} from '../types';
import {
    buildUserCoAuthorTrailer,
    normalizeProjectSubPath,
    quoteShellArgument,
} from '../utils';
import type {
    AdoptPullRequestArgs,
    ClosePullRequestArgs,
    GitProvider,
    LandedCommit,
    OpenPullRequestArgs,
    UpdatePullRequestArgs,
} from './GitProvider';
import {
    assertStagedPathsAllowed,
    collectDiffStat,
    commitLocal,
    resolveDbtProjectPaths,
    stageChanges,
} from './sandboxGit';

const asConnection = (connection: GitConnection): BitbucketConnection => {
    if (connection.provider !== PullRequestProvider.BITBUCKET) {
        throw new ParameterError('Expected a Bitbucket connection');
    }
    return connection;
};

const asInstallation = (
    installation: GitInstallation,
): BitbucketInstallation => {
    if (installation.provider !== PullRequestProvider.BITBUCKET) {
        throw new ParameterError('Expected Bitbucket credentials');
    }
    return installation;
};

const assertRepository = (
    repository: { owner: string; repo: string },
    installation: BitbucketInstallation,
): void => {
    if (
        repository.owner !== installation.owner ||
        repository.repo !== installation.repo
    ) {
        throw new ForbiddenError(
            'Bitbucket credentials do not match the selected repository',
        );
    }
};

const parsePullRequest = (
    prUrl: string,
    repository: { owner: string; repo: string },
): number => {
    let url: URL;
    try {
        url = new URL(prUrl);
    } catch {
        throw new ParameterError('Invalid Bitbucket pull request URL');
    }
    const prefix = `/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/pull-requests/`;
    const suffix = url.pathname.startsWith(prefix)
        ? url.pathname.slice(prefix.length)
        : '';
    if (
        url.protocol !== 'https:' ||
        url.host !== 'bitbucket.org' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !/^[1-9][0-9]*\/?$/.test(suffix)
    ) {
        throw new ParameterError(
            'Only Bitbucket Cloud pull requests in the selected repository can be edited',
        );
    }
    const number = Number(suffix.replace(/\/$/, ''));
    if (!Number.isSafeInteger(number)) {
        throw new ParameterError('Invalid Bitbucket pull request number');
    }
    return number;
};

const assertPullRequestRepository = (
    pullRequest: BitbucketClient.BitbucketPullRequest,
    installation: BitbucketInstallation,
): void => {
    const repository =
        `${installation.owner}/${installation.repo}`.toLowerCase();
    if (
        pullRequest.sourceRepository?.toLowerCase() !== repository ||
        pullRequest.destinationRepository?.toLowerCase() !== repository
    ) {
        throw new ParameterError(
            'Cannot edit a fork pull request or a pull request with unknown repositories',
        );
    }
};

const assertOpen = (
    pullRequest: BitbucketClient.BitbucketPullRequest,
): void => {
    if (pullRequest.state !== PullRequestState.OPEN) {
        throw new ParameterError(
            `This Bitbucket pull request is ${pullRequest.state}. Open a new pull request instead.`,
        );
    }
};

export class BitbucketProvider extends BaseService implements GitProvider {
    readonly provider = PullRequestProvider.BITBUCKET;

    private readonly projectModel: ProjectModel;

    private readonly projectDbtSourcesModel: ProjectDbtSourcesModel;

    constructor(dependencies: {
        projectModel: ProjectModel;
        projectDbtSourcesModel: ProjectDbtSourcesModel;
        logger: Logger;
    }) {
        super({ logger: dependencies.logger });
        this.projectModel = dependencies.projectModel;
        this.projectDbtSourcesModel = dependencies.projectDbtSourcesModel;
    }

    resolveConnection(
        dbtConnection: DbtProjectConfig,
        context?: { projectUuid: string; projectDbtSourceUuid: string | null },
    ): BitbucketConnection {
        if (!context || dbtConnection.type !== DbtProjectType.BITBUCKET) {
            throw new ParameterError(
                'Bitbucket writeback requires a project dbt connection',
            );
        }
        return {
            provider: PullRequestProvider.BITBUCKET,
            ...BitbucketClient.resolveBitbucketRepository(dbtConnection),
            ...context,
            username: dbtConnection.username,
            projectSubPath: normalizeProjectSubPath(
                dbtConnection.project_sub_path,
            ),
            branch: dbtConnection.branch,
            semanticLayer: dbtConnection.semanticLayer,
        };
    }

    async resolveInstallation(
        organizationUuid: string,
        options?: { user?: SessionUser; connection?: GitConnection },
    ): Promise<BitbucketInstallation> {
        if (!options?.user || !options.connection) {
            throw new ForbiddenError(
                'Bitbucket writeback requires a user and a project connection',
            );
        }
        const connection = asConnection(options.connection);
        const project = await this.projectModel.getSummary(
            connection.projectUuid,
        );
        if (
            project.organizationUuid !== organizationUuid ||
            options.user.organizationUuid !== organizationUuid ||
            this.createAuditedAbility(options.user).cannot(
                'manage',
                subject('SourceCode', {
                    organizationUuid: project.organizationUuid,
                    projectUuid: connection.projectUuid,
                    isProtectedBranch: false,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const current = await this.getCurrentConnection(connection);
        if (
            current.type !== DbtProjectType.BITBUCKET ||
            current.username !== connection.username
        ) {
            throw new ForbiddenError(
                'The Bitbucket connection changed. Start a new writeback.',
            );
        }
        if (!current.personal_access_token?.trim()) {
            throw new WritebackGitNotConnectedError(
                PullRequestProvider.BITBUCKET,
                'Configure an API token for the selected Bitbucket dbt source',
            );
        }
        const credentials =
            BitbucketClient.resolveBitbucketCredentials(current);
        const installation: BitbucketInstallation = {
            ...credentials,
            provider: PullRequestProvider.BITBUCKET,
            commitAuthor: {
                name: COMMIT_AUTHOR_NAME,
                email: COMMIT_AUTHOR_EMAIL,
            },
        };
        assertRepository(connection, installation);
        try {
            await BitbucketClient.getRepository(credentials);
        } catch (error) {
            if (error instanceof ForbiddenError) {
                throw new WritebackGitNotConnectedError(
                    PullRequestProvider.BITBUCKET,
                    'The Bitbucket API token is invalid, expired or lacks repository access. Update the token in the project connection.',
                );
            }
            throw error;
        }
        return installation;
    }

    private async getCurrentConnection(
        connection: BitbucketConnection,
    ): Promise<DbtProjectConfig> {
        if (connection.projectDbtSourceUuid) {
            const source = await this.projectDbtSourcesModel.getSource(
                connection.projectDbtSourceUuid,
            );
            if (source.projectUuid !== connection.projectUuid) {
                throw new ForbiddenError(
                    'The dbt source does not belong to this project',
                );
            }
            if (!source.dbtConnection || source.hasCredentialError) {
                throw new ParameterError(
                    'The selected dbt source has no usable Bitbucket credentials',
                );
            }
            return source.dbtConnection;
        }
        return (
            await this.projectModel.getWithSensitiveFields(
                connection.projectUuid,
            )
        ).dbtConnection;
    }

    getCloneTarget(
        connection: GitConnection,
        installation: GitInstallation,
    ): CloneTarget {
        const target = asConnection(connection);
        const credentials = asInstallation(installation);
        assertRepository(target, credentials);
        return {
            url: `https://bitbucket.org/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}.git`,
            username: 'x-bitbucket-api-token-auth',
            password: credentials.token,
        };
    }

    private async readPullRequest(
        args: AdoptPullRequestArgs,
    ): Promise<BitbucketClient.BitbucketPullRequest> {
        const connection = asConnection(args.connection);
        const installation = asInstallation(args.installation);
        assertRepository(connection, installation);
        const pullNumber = parsePullRequest(args.prUrl, connection);
        const pullRequest = await BitbucketClient.getPullRequest({
            ...installation,
            pullNumber,
        });
        assertPullRequestRepository(pullRequest, installation);
        return pullRequest;
    }

    async getPullRequestEditState(
        args: AdoptPullRequestArgs,
    ): Promise<{ editable: boolean; reason: 'merged' | 'closed' | null }> {
        const pullRequest = await this.readPullRequest(args);
        if (pullRequest.state === PullRequestState.MERGED) {
            return { editable: false, reason: 'merged' };
        }
        if (pullRequest.state === PullRequestState.CLOSED) {
            return { editable: false, reason: 'closed' };
        }
        return { editable: true, reason: null };
    }

    async adoptPullRequest(
        args: AdoptPullRequestArgs,
    ): Promise<AdoptedPullRequest> {
        const pullRequest = await this.readPullRequest(args);
        assertOpen(pullRequest);
        const connection = asConnection(args.connection);
        return {
            prUrl: pullRequest.html_url,
            owner: connection.owner,
            repo: connection.repo,
            pullNumber: pullRequest.number,
            headRef: pullRequest.head,
        };
    }

    async openPullRequest(
        args: OpenPullRequestArgs,
    ): Promise<{ prUrl: string } & LandedCommit> {
        const connection = asConnection(args.connection);
        assertRepository(connection, asInstallation(args.installation));
        const base = (await args.sandbox.git.status(CWD)).currentBranch;
        if (!base || (connection.branch && base !== connection.branch)) {
            throw new ParameterError(
                'The sandbox is not on the configured Bitbucket base branch',
            );
        }
        const branch = `lightdash-ai-writeback/${randomUUID()}`;
        await args.sandbox.git.createBranch(CWD, branch);
        const landed = await this.landChanges(args, branch);
        args.setStage('pull_request');
        const pullRequest = await BitbucketClient.createPullRequest({
            ...asInstallation(args.installation),
            title: args.title,
            body: args.description,
            head: branch,
            base,
        });
        return { prUrl: pullRequest.html_url, ...landed };
    }

    async updatePullRequest(
        args: UpdatePullRequestArgs,
    ): Promise<LandedCommit> {
        const pullRequest = await this.readPullRequest(args);
        assertOpen(pullRequest);
        const branch = (await args.sandbox.git.status(CWD)).currentBranch;
        if (
            !branch ||
            branch !== pullRequest.head ||
            branch === pullRequest.base
        ) {
            throw new ParameterError(
                'The sandbox is not on the Bitbucket pull request branch',
            );
        }
        const landed = await this.landChanges(args, branch);
        args.setStage('pull_request');
        await BitbucketClient.updatePullRequest({
            ...asInstallation(args.installation),
            pullNumber: pullRequest.number,
            title: args.title,
            body: args.description,
        });
        return landed;
    }

    async closePullRequest(
        args: ClosePullRequestArgs,
    ): Promise<ClosePullRequestResult> {
        const installation = asInstallation(args.installation);
        assertRepository(args, installation);
        const pullNumber = parsePullRequest(args.prUrl, installation);
        if (pullNumber !== args.pullNumber) {
            throw new ParameterError(
                'Bitbucket pull request identifiers do not match',
            );
        }
        const pullRequest = await BitbucketClient.getPullRequest({
            ...installation,
            pullNumber,
        });
        assertPullRequestRepository(pullRequest, installation);
        if (pullRequest.state === PullRequestState.MERGED) {
            throw new ParameterError(
                'This Bitbucket pull request is already merged',
            );
        }
        if (pullRequest.state === PullRequestState.CLOSED) {
            return { state: 'closed' };
        }
        const closed = await BitbucketClient.declinePullRequest({
            ...installation,
            pullNumber,
        });
        return {
            state: closed.state === PullRequestState.CLOSED ? 'closed' : 'open',
        };
    }

    private async landChanges(
        args: OpenPullRequestArgs,
        branch: string,
    ): Promise<LandedCommit> {
        const connection = asConnection(args.connection);
        const installation = asInstallation(args.installation);
        assertRepository(connection, installation);
        args.setStage('commit');
        await this.clearPushCredentials(args);
        const hooks = await args.sandbox.commands.run(
            `git -C ${CWD} config --local core.hooksPath /dev/null`,
        );
        if (hooks.exitCode !== 0) {
            throw new UnexpectedGitError(
                'Could not disable Bitbucket sandbox Git hooks',
            );
        }
        const paths =
            connection.semanticLayer === 'lightdash'
                ? [connection.projectSubPath]
                : await resolveDbtProjectPaths(
                      args.sandbox,
                      connection.projectSubPath,
                      this.logger,
                  );
        await stageChanges(args.sandbox, paths, this.logger);
        await assertStagedPathsAllowed(args.sandbox);
        const diffStat = await collectDiffStat(args.sandbox);
        const trailer = buildUserCoAuthorTrailer(args.user);
        await commitLocal(
            args.sandbox,
            trailer ? `${args.title}\n\n${trailer}` : args.title,
            installation.commitAuthor,
        );
        args.setStage('push');
        try {
            const remote = quoteShellArgument(
                this.getCloneTarget(connection, installation).url,
            );
            const reset = await args.sandbox.commands.run(
                `git -C ${CWD} remote set-url origin ${remote} && ` +
                    `if git -C ${CWD} config --local --get-all remote.origin.pushurl >/dev/null; then git -C ${CWD} config --local --unset-all remote.origin.pushurl; fi`,
            );
            if (reset.exitCode !== 0) {
                throw new Error('Could not reset the Bitbucket remote');
            }
            await args.sandbox.git.push(CWD, {
                remote: 'origin',
                branch,
                username: 'x-bitbucket-api-token-auth',
                password: installation.token,
            });
        } catch {
            throw new UnexpectedGitError(
                'Could not push the Bitbucket writeback branch. Check repository access and branch restrictions.',
            );
        } finally {
            await this.clearPushCredentials(args);
        }
        const result = await args.sandbox.commands.run(
            `git -C ${CWD} rev-parse HEAD`,
        );
        return { commitSha: result.stdout.trim(), ...diffStat };
    }

    private async clearPushCredentials(
        args: OpenPullRequestArgs,
    ): Promise<void> {
        // SDKs may persist authentication in .git even when pushing fails.
        try {
            const remote = quoteShellArgument(
                this.getCloneTarget(args.connection, args.installation).url,
            );
            const result = await args.sandbox.commands.run(
                `git -C ${CWD} remote set-url origin ${remote} && if git -C ${CWD} config --local --get-regexp '^credential\\.' >/dev/null; then git -C ${CWD} config --local --remove-section credential; fi`,
            );
            if (result.exitCode !== 0) {
                throw new Error('Credential cleanup failed');
            }
        } catch {
            throw new WritebackCredentialCleanupError();
        }
    }
}
