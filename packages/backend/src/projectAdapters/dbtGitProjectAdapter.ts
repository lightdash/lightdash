import {
    AuthorizationError,
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    NotFoundError,
    SupportedDbtVersions,
    UnexpectedGitError,
    UnexpectedServerError,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import fs from 'fs';
import * as fspromises from 'fs-extra';
import * as path from 'path';
import simpleGit, {
    GitError,
    SimpleGit,
    SimpleGitProgressEvent,
} from 'simple-git';
import Logger from '../logging/logger';
import { CachedWarehouse } from '../types';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';

export type DbtGitProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    remoteRepositoryUrl: string;
    repository: string;
    gitBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    useDbtLs: boolean;
};

const stripTokensFromUrls = (raw: string) => {
    const pattern = /\/\/(.*)@/g;
    return raw.replace(pattern, '//*****@');
};

const gitErrorHandler = (e: Error, repository: string) => {
    if (e.message.includes('Authentication failed')) {
        throw new AuthorizationError(
            'Git credentials not recognized for this repository',
            { message: e.message },
        );
    }
    if (e.message.includes('Repository not found')) {
        throw new NotFoundError(
            `Could not find Git repository "${repository}". Check that your personal access token has access to the repository and that the repository name is correct.`,
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

export class DbtGitProjectAdapter extends DbtLocalCredentialsProjectAdapter {
    localRepositoryDir: string;

    remoteRepositoryUrl: string;

    repository: string;

    projectDirectorySubPath: string;

    branch: string;

    git: SimpleGit;

    constructor({
        warehouseClient,
        repository,
        remoteRepositoryUrl,
        gitBranch,
        projectDirectorySubPath,
        warehouseCredentials,
        targetName,
        environment,
        cachedWarehouse,
        dbtVersion,
        useDbtLs,
    }: DbtGitProjectAdapterArgs) {
        const localRepositoryDir = fs.mkdtempSync('/tmp/git_');
        const projectDir = path.join(
            localRepositoryDir,
            projectDirectorySubPath,
        );
        super({
            warehouseClient,
            projectDir,
            warehouseCredentials,
            targetName,
            environment,
            cachedWarehouse,
            dbtVersion,
            useDbtLs,
        });
        this.projectDirectorySubPath = projectDirectorySubPath;
        this.localRepositoryDir = localRepositoryDir;
        this.remoteRepositoryUrl = remoteRepositoryUrl;
        this.branch = gitBranch;
        this.repository = repository;
        this.git = simpleGit({
            progress({ method, stage, progress }: SimpleGitProgressEvent) {
                Logger.debug(
                    `git.${method} ${stage} stage ${progress}% complete`,
                );
            },
        });
    }

    async destroy(): Promise<void> {
        Logger.debug(`Destroy git project adapter`);
        await this._destroyLocal();
        await super.destroy();
    }

    private async _destroyLocal() {
        try {
            Logger.debug(`Destroy ${this.localRepositoryDir}`);
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

            Logger.debug(`Git clone to ${this.localRepositoryDir}`);
            await this.git
                .env('GIT_TERMINAL_PROMPT', '0')
                .clone(
                    this.remoteRepositoryUrl,
                    this.localRepositoryDir,
                    defaultCloneOptions,
                );
        } catch (e) {
            gitErrorHandler(e, this.repository);
        }
    }

    private async _pull() {
        try {
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
        } catch (e) {
            gitErrorHandler(e, this.repository);
        }
    }

    private async _refreshRepo() {
        try {
            await this._pull();
        } catch (e) {
            Logger.debug(`Failed git pull ${e}`);
            await this._cleanLocal();
            await this._clone();
        }
    }

    public async compileAllExplores() {
        await this._refreshRepo();
        return super.compileAllExplores();
    }

    public async test() {
        await this._refreshRepo();
        await super.test();
    }
}
