import {
    AuthorizationError,
    getErrorMessage,
    NotFoundError,
    UnexpectedGitError,
    UnexpectedServerError,
} from '@lightdash/common';
import execa from 'execa';
import * as fspromises from 'fs-extra';
import { GitError, type SimpleGit } from 'simple-git';
import Logger from '../logging/logger';
import { awaitDetachedProcess } from '../utils/detachedProcess';

// simple-git blocks every GIT_* variable passed via .env() unless the instance allows it
export const GIT_REPOSITORY_ENVIRONMENT = ['GIT_TERMINAL_PROMPT'];

const stripTokensFromUrls = (raw: string) => {
    const pattern = /\/\/(.*)@/g;
    return raw.replace(pattern, '//*****@');
};

export const gitErrorHandler = (e: unknown, repository: string) => {
    if (!(e instanceof Error)) {
        throw new UnexpectedServerError(
            `Unexpected git error: ${stripTokensFromUrls(getErrorMessage(e))}`,
        );
    }
    if (e.message.includes('Authentication failed')) {
        throw new AuthorizationError(
            'Git credentials not recognized for this repository',
            { message: stripTokensFromUrls(e.message) },
        );
    }
    if (e.message.includes('Repository not found')) {
        throw new NotFoundError(
            `Could not find git repository "${repository}". Check that your personal access token has access to the repository and that the repository name is correct.`,
        );
    }
    if (e instanceof GitError) {
        throw new UnexpectedGitError(
            `Error while running "${
                e.task?.commands[0]
            }": ${stripTokensFromUrls(e.message)}`,
        );
    }
    throw new UnexpectedGitError(
        `Unexpected error while cloning git repository: ${stripTokensFromUrls(
            e.message,
        )}`,
    );
};

export class GitRepository {
    constructor(
        private readonly git: SimpleGit,
        private readonly localRepositoryDir: string,
        private readonly remoteRepositoryUrl: string,
        private readonly repository: string,
        private readonly branch: string,
        private readonly signalEnvironment: Record<string, string> = {},
    ) {}
    private async _cleanLocal() {
        try {
            Logger.debug(`Clean ${this.localRepositoryDir}`);
            await fspromises.emptyDir(this.localRepositoryDir);
        } catch (e) {
            throw new UnexpectedServerError(
                `Unexpected error while cleaning local git directory: ${e}`,
            );
        }
    }

    private async _clone() {
        try {
            const defaultCloneOptions = {
                '--single-branch': null,
                '--depth': 1,
                '--branch': this.branch,
                '--no-tags': null,
                '--progress': null,
            };

            const startTime = Date.now();
            Logger.debug(`Git clone to ${this.localRepositoryDir}`);
            await this.git
                .env('GIT_TERMINAL_PROMPT', '0')
                .clone(
                    this.remoteRepositoryUrl,
                    this.localRepositoryDir,
                    defaultCloneOptions,
                );
            Logger.info(`Git clone completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            gitErrorHandler(e, this.repository);
        }
    }

    private async _pull() {
        try {
            const startTime = Date.now();
            Logger.debug(`Git pull to ${this.localRepositoryDir}`);
            await fspromises.access(this.localRepositoryDir);
            await this.git
                .env('GIT_TERMINAL_PROMPT', '0')
                .cwd(this.localRepositoryDir)
                .pull(this.remoteRepositoryUrl, this.branch, {
                    '--ff-only': null,
                    '--depth': 1,
                    '--no-tags': null,
                    '--progress': null,
                });
            Logger.info(`Git pull completed in ${Date.now() - startTime}ms`);
        } catch (e) {
            gitErrorHandler(e, this.repository);
        }
    }

    private async runGit(args: string[], signal: AbortSignal, cwd?: string) {
        signal.throwIfAborted();
        try {
            await awaitDetachedProcess(
                execa('git', args, {
                    cwd,
                    extendEnv: false,
                    env: {
                        ...this.signalEnvironment,
                        GIT_TERMINAL_PROMPT: '0',
                    },
                    ...(process.platform === 'linux' ? { detached: true } : {}),
                }),
                signal,
            );
            signal.throwIfAborted();
        } catch (error) {
            signal.throwIfAborted();
            gitErrorHandler(error, this.repository);
        }
    }

    private async refreshWithSignal(signal: AbortSignal) {
        signal.throwIfAborted();
        try {
            await fspromises.access(this.localRepositoryDir);
            await this.runGit(
                [
                    'pull',
                    this.remoteRepositoryUrl,
                    this.branch,
                    '--ff-only',
                    '--depth=1',
                    '--no-tags',
                    '--progress',
                ],
                signal,
                this.localRepositoryDir,
            );
        } catch (error) {
            signal.throwIfAborted();
            await this._cleanLocal();
            await this.runGit(
                [
                    'clone',
                    '--single-branch',
                    '--depth=1',
                    `--branch=${this.branch}`,
                    '--no-tags',
                    '--progress',
                    this.remoteRepositoryUrl,
                    this.localRepositoryDir,
                ],
                signal,
            );
        }
    }

    public async refresh(signal?: AbortSignal) {
        if (signal) return this.refreshWithSignal(signal);
        const startTime = Date.now();
        try {
            await this._pull();
        } catch (e) {
            Logger.debug(`Failed git pull ${e}`);
            await this._cleanLocal();
            await this._clone();
        }
        Logger.info(
            `Git repo refresh completed in ${Date.now() - startTime}ms`,
        );
    }
}
