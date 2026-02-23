import {
    AuthorizationError,
    getErrorMessage,
    NotFoundError,
    UnexpectedGitError,
    UnexpectedServerError,
} from '@lightdash/common';
import * as fs from 'fs';
import * as fspromises from 'fs-extra';
import * as path from 'path';
import simpleGit, {
    GitError,
    SimpleGit,
    SimpleGitProgressEvent,
} from 'simple-git';
import Logger from '../../logging/logger';
import { GitUrlBuilder, GitUrlParams, SourceAccessor } from '../types';

export type GitSourceAccessorArgs = {
    /** Function to build the authenticated git URL */
    urlBuilder: GitUrlBuilder;
    /** Parameters for the URL builder */
    urlParams: GitUrlParams;
    /** Branch to clone/pull */
    branch: string;
    /** Relative path to dbt project within the repository */
    projectSubPath: string;
};

/**
 * Strip tokens from URLs in error messages to prevent credential leakage
 */
const stripTokensFromUrls = (raw: string): string => {
    const pattern = /\/\/(.*)@/g;
    return raw.replace(pattern, '//*****@');
};

/**
 * Convert git errors to appropriate Lightdash error types
 */
const handleGitError = (e: unknown, repository: string): never => {
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
            `Error while running "${e.task?.commands[0]}": ${stripTokensFromUrls(e.message)}`,
        );
    }
    throw new UnexpectedGitError(
        `Unexpected error while cloning git repository: ${e}`,
    );
};

/**
 * SourceAccessor implementation that clones/pulls from git repositories.
 * Uses URL builders to construct authenticated URLs for different git providers.
 */
export class GitSourceAccessor implements SourceAccessor {
    private readonly remoteUrl: string;

    private readonly repository: string;

    private readonly branch: string;

    private readonly projectSubPath: string;

    private readonly localRepositoryDir: string;

    private readonly projectDir: string;

    private readonly git: SimpleGit;

    private hasCloned: boolean = false;

    constructor({
        urlBuilder,
        urlParams,
        branch,
        projectSubPath,
    }: GitSourceAccessorArgs) {
        this.remoteUrl = urlBuilder(urlParams);
        this.repository = urlParams.repository;
        this.branch = branch;
        this.projectSubPath = projectSubPath;
        this.localRepositoryDir = fs.mkdtempSync('/tmp/git_');
        this.projectDir = path.join(this.localRepositoryDir, projectSubPath);
        this.git = simpleGit({
            progress({ method, stage, progress }: SimpleGitProgressEvent) {
                Logger.debug(
                    `git.${method} ${stage} stage ${progress}% complete`,
                );
            },
        });
    }

    getProjectDirectory(): string {
        return this.projectDir;
    }

    async refresh(): Promise<void> {
        if (!this.hasCloned) {
            await this.clone();
        } else {
            await this.refreshRepo();
        }
    }

    async test(): Promise<void> {
        // Clone the repo to verify we can access it
        await this.refresh();
    }

    async destroy(): Promise<void> {
        Logger.debug(`Destroy GitSourceAccessor: ${this.localRepositoryDir}`);
        try {
            await fspromises.rm(this.localRepositoryDir, {
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
            const cloneOptions = {
                '--single-branch': null,
                '--depth': 1,
                '--branch': this.branch,
                '--no-tags': null,
                '--progress': null,
            };

            Logger.debug(`Git clone to ${this.localRepositoryDir}`);
            await this.git
                .env('GIT_TERMINAL_PROMPT', '0')
                .clone(this.remoteUrl, this.localRepositoryDir, cloneOptions);

            this.hasCloned = true;
        } catch (e) {
            handleGitError(e, this.repository);
        }
    }

    private async pull(): Promise<void> {
        try {
            Logger.debug(`Git pull to ${this.localRepositoryDir}`);
            await fspromises.access(this.localRepositoryDir);
            await this.git
                .env('GIT_TERMINAL_PROMPT', '0')
                .cwd(this.localRepositoryDir)
                .pull(this.remoteUrl, this.branch, {
                    '--ff-only': null,
                    '--depth': 1,
                    '--no-tags': null,
                    '--progress': null,
                });
        } catch (e) {
            handleGitError(e, this.repository);
        }
    }

    private async cleanLocal(): Promise<void> {
        try {
            Logger.debug(`Clean ${this.localRepositoryDir}`);
            await fspromises.emptyDir(this.localRepositoryDir);
            this.hasCloned = false;
        } catch (e) {
            throw new UnexpectedServerError(
                `Unexpected error while cleaning local git directory: ${e}`,
            );
        }
    }

    private async refreshRepo(): Promise<void> {
        try {
            await this.pull();
        } catch (e) {
            Logger.debug(`Failed git pull, falling back to clone: ${e}`);
            await this.cleanLocal();
            await this.clone();
        }
    }
}

/**
 * Factory function to create GitSourceAccessor
 */
export const createGitSourceAccessor = (
    args: GitSourceAccessorArgs,
): SourceAccessor => new GitSourceAccessor(args);
