import { CreateWarehouseCredentials } from 'common';
import * as fspromises from 'fs/promises';
import * as path from 'path';
import simpleGit, { SimpleGit, SimpleGitProgressEvent } from 'simple-git';
import tempy from 'tempy';
import { UnexpectedGitError, UnexpectedServerError } from '../errors';
import Logger from '../logger';
import { WarehouseClient } from '../types';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';

const git: SimpleGit = simpleGit({
    progress({ method, stage, progress }: SimpleGitProgressEvent) {
        Logger.debug(`git.${method} ${stage} stage ${progress}% complete`);
    },
});

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

    constructor({
        warehouseClient,
        remoteRepositoryUrl,
        gitBranch,
        projectDirectorySubPath,
        warehouseCredentials,
    }: DbtGitProjectAdapterArgs) {
        const localRepositoryDir = tempy.directory();
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
    }

    async destroy(): Promise<void> {
        await this._cleanLocal();
        await super.destroy();
    }

    private async _cleanLocal() {
        try {
            Logger.debug(`Clean ${this.localRepositoryDir}`);
            await fspromises.rm(this.localRepositoryDir, {
                recursive: true,
                force: true,
            });
        } catch (e) {
            throw new UnexpectedServerError(
                `Unexpected error while cleaning local git directory: ${e}`,
            );
        }
    }

    private async _clone() {
        try {
            Logger.debug(`Git clone to ${this.localRepositoryDir}`);
            await git.clone(this.remoteRepositoryUrl, this.localRepositoryDir, {
                '--single-branch': null,
                '--depth': 1,
                '--branch': this.branch,
                '--sparse': null,
                '--no-tags': null,
                '--progress': null,
            });
            Logger.debug(`Git sparse-checkout to ${this.localRepositoryDir}`);
            await simpleGit().raw(
                'sparse-checkout',
                `set "${this.projectDirectorySubPath}"`,
            );
        } catch (e) {
            console.log(JSON.stringify(e));
            // if (e instanceof Errors.HttpError) {
            //     if (e.data.statusCode === 401) {
            //         throw new AuthorizationError(
            //             'Git credentials not recognized',
            //             e.data,
            //         );
            //     }
            //     if (e.data.statusCode === 404) {
            //         throw new NotFoundError(`No git repository found`);
            //     }
            //     throw new UnexpectedGitError(
            //         `Unexpected error while cloning git repository: ${e.message}`,
            //         e.data,
            //     );
            // }
            // if (e instanceof Errors.NotFoundError) {
            //     throw new NotFoundError(e.message);
            // }
            throw new UnexpectedGitError(
                `Unexpected error while cloning git repository: ${e}`,
            );
        }
    }

    private async _refreshRepo() {
        await this._cleanLocal();
        await this._clone();
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
