/**
 * Helper module for managing git repository operations.
 * Extracted from DbtGitProjectAdapter for reuse and testability.
 */
import {
    AuthorizationError,
    getErrorMessage,
    NotFoundError,
    UnexpectedGitError,
    UnexpectedServerError,
} from '@lightdash/common';
import fs from 'fs';
import * as fspromises from 'fs-extra';
import simpleGit, {
    GitError,
    SimpleGit,
    SimpleGitProgressEvent,
} from 'simple-git';
import Logger from '../logging/logger';

const stripTokensFromUrls = (raw: string): string => {
    const pattern = /\/\/(.*)@/g;
    return raw.replace(pattern, '//*****@');
};

const gitErrorHandler = (e: unknown, repository: string): never => {
    if (!(e instanceof Error)) {
        throw new UnexpectedServerError(
            `Unexpected git error: ${getErrorMessage(e)}`,
        );
    }
    if (e.message.includes('Authentication failed')) {
        throw new AuthorizationError(
            'Git credentials not recognized for this repository',
            { message: e.message },
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
        `Unexpected error while cloning git repository: ${e}`,
    );
};

export interface GitRepoManager {
    localDir: string;
    refresh(): Promise<void>;
    cleanup(): Promise<void>;
}

export type CreateGitRepoManagerArgs = {
    remoteUrl: string;
    branch: string;
    repository: string;
};

class GitRepoManagerImpl implements GitRepoManager {
    public readonly localDir: string;

    private readonly remoteUrl: string;

    private readonly branch: string;

    private readonly repository: string;

    private readonly git: SimpleGit;

    constructor({ remoteUrl, branch, repository }: CreateGitRepoManagerArgs) {
        this.localDir = fs.mkdtempSync('/tmp/git_');
        this.remoteUrl = remoteUrl;
        this.branch = branch;
        this.repository = repository;
        this.git = simpleGit({
            progress({ method, stage, progress }: SimpleGitProgressEvent) {
                Logger.debug(
                    `git.${method} ${stage} stage ${progress}% complete`,
                );
            },
        });
    }

    async refresh(): Promise<void> {
        try {
            await this.pull();
        } catch (e) {
            Logger.debug(`Failed git pull ${e}`);
            await this.clean();
            await this.clone();
        }
    }

    async cleanup(): Promise<void> {
        try {
            Logger.debug(`Destroy ${this.localDir}`);
            await fspromises.rm(this.localDir, {
                recursive: true,
                force: true,
            });
        } catch (e) {
            throw new UnexpectedServerError(
                `Unexpected error while removing local git directory: ${e}`,
            );
        }
    }

    private async clone(): Promise<void> {
        try {
            const defaultCloneOptions = {
                '--single-branch': null,
                '--depth': 1,
                '--branch': this.branch,
                '--no-tags': null,
                '--progress': null,
            };

            Logger.debug(`Git clone to ${this.localDir}`);
            await this.git
                .env('GIT_TERMINAL_PROMPT', '0')
                .clone(this.remoteUrl, this.localDir, defaultCloneOptions);
        } catch (e) {
            gitErrorHandler(e, this.repository);
        }
    }

    private async pull(): Promise<void> {
        try {
            Logger.debug(`Git pull to ${this.localDir}`);
            await fspromises.access(this.localDir);
            await this.git
                .env('GIT_TERMINAL_PROMPT', '0')
                .cwd(this.localDir)
                .pull(this.remoteUrl, this.branch, {
                    '--ff-only': null,
                    '--depth': 1,
                    '--no-tags': null,
                    '--progress': null,
                });
        } catch (e) {
            gitErrorHandler(e, this.repository);
        }
    }

    private async clean(): Promise<void> {
        try {
            Logger.debug(`Clean ${this.localDir}`);
            await fspromises.emptyDir(this.localDir);
        } catch (e) {
            throw new UnexpectedServerError(
                `Unexpected error while cleaning local git directory: ${e}`,
            );
        }
    }
}

export function createGitRepoManager(
    args: CreateGitRepoManagerArgs,
): GitRepoManager {
    return new GitRepoManagerImpl(args);
}
