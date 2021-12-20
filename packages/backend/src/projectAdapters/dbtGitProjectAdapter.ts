import { CreateWarehouseCredentials } from 'common';
import * as fspromises from 'fs/promises';
import * as path from 'path';
import simpleGit, { SimpleGit, SimpleGitProgressEvent } from 'simple-git';
import tempy from 'tempy';
import {
    AuthorizationError,
    UnexpectedGitError,
    UnexpectedServerError,
} from '../errors';
import Logger from '../logger';
import { WarehouseClient } from '../types';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';

export type DbtGitProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    remoteRepositoryUrl: string;
    gitBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
};

export class DbtGitProjectAdapter extends DbtLocalCredentialsProjectAdapter {
    localRepositoryDir: string;

    remoteRepositoryUrl: string;

    projectDirectorySubPath: string;

    branch: string;

    git: SimpleGit;

    constructor({
        warehouseClient,
        remoteRepositoryUrl,
        gitBranch,
        projectDirectorySubPath,
        warehouseCredentials,
    }: DbtGitProjectAdapterArgs) {
        const localRepositoryDir = tempy.directory({
            prefix: 'git_',
        });
        const projectDir = path.join(
            localRepositoryDir,
            projectDirectorySubPath,
        );
        super({
            warehouseClient,
            projectDir,
            warehouseCredentials,
        });
        this.projectDirectorySubPath = projectDirectorySubPath;
        this.localRepositoryDir = localRepositoryDir;
        this.remoteRepositoryUrl = remoteRepositoryUrl;
        this.branch = gitBranch;
        this.git = simpleGit({
            progress({ method, stage, progress }: SimpleGitProgressEvent) {
                Logger.debug(
                    `git.${method} ${stage} stage ${progress}% complete`,
                );
            },
        });
    }

    async destroy(): Promise<void> {
        await this.removeLocalDir();
        await super.destroy();
    }

    private async removeLocalDir() {
        try {
            Logger.debug(`Remove ${this.localRepositoryDir}`);
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

    private async cleanLocalDir() {
        try {
            Logger.debug(`Clean ${this.localRepositoryDir}`);
            await fspromises
                .readdir(this.localRepositoryDir, { withFileTypes: true })
                .then((f) =>
                    Promise.all(
                        f.map((e) => {
                            if (e.isFile()) {
                                return fspromises.unlink(e.name);
                            }
                            if (e.isDirectory()) {
                                return fspromises.rm(e.name, {
                                    recursive: true,
                                    force: true,
                                });
                            }
                            return Promise.resolve();
                        }),
                    ),
                );
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

            if (this.projectDirectorySubPath !== '/') {
                Logger.debug(`Git clone sparse to ${this.localRepositoryDir}`);
                await this.git.clone(
                    this.remoteRepositoryUrl,
                    this.localRepositoryDir,
                    {
                        ...defaultCloneOptions,
                        '--sparse': null,
                    },
                );
                Logger.debug(
                    `Git sparse-checkout ${this.projectDirectorySubPath}`,
                );
                await this.git
                    .cwd(this.localRepositoryDir)
                    .raw(
                        `sparse-checkout`,
                        `set`,
                        `${this.projectDirectorySubPath}`,
                    );
            } else {
                Logger.debug(`Git clone to ${this.localRepositoryDir}`);
                await this.git.clone(
                    this.remoteRepositoryUrl,
                    this.localRepositoryDir,
                    defaultCloneOptions,
                );
            }
        } catch (e) {
            if (e.message.includes('Authentication failed')) {
                throw new AuthorizationError(
                    'Git credentials not recognized for this repository',
                    { message: e.message },
                );
            }
            throw new UnexpectedGitError(
                `Unexpected error while cloning git repository: ${e}`,
            );
        }
    }

    private async _pull() {
        try {
            Logger.debug(`Git pull to ${this.localRepositoryDir}`);
            await fspromises.access(this.localRepositoryDir);
            await this.git
                .cwd(this.localRepositoryDir)
                .pull(this.remoteRepositoryUrl, this.branch, {
                    '--ff-only': null,
                    '--depth': 1,
                    '--no-tags': null,
                    '--progress': null,
                });
        } catch (e) {
            throw new UnexpectedGitError(
                `Unexpected error while pulling git repository: ${e}`,
            );
        }
    }

    private async _refreshRepo() {
        try {
            await this._pull();
        } catch (e) {
            Logger.debug(`Failed git pull ${e}`);
            await this.cleanLocalDir();
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
