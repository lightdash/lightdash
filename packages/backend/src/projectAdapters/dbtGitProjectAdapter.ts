import { CreateWarehouseCredentials } from 'common';
import * as fs from 'fs';
import * as fspromises from 'fs/promises';
import * as git from 'isomorphic-git';
import { Errors } from 'isomorphic-git';
import * as http from 'isomorphic-git/http/node';
import * as path from 'path';
import tempy from 'tempy';
import {
    AuthorizationError,
    NotFoundError,
    UnexpectedGitError,
    UnexpectedServerError,
} from '../errors';
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
            await git.clone({
                fs,
                http,
                dir: this.localRepositoryDir,
                url: this.remoteRepositoryUrl,
                singleBranch: true,
                depth: 1,
                noTags: true,
                ref: this.branch,
            });
        } catch (e) {
            if (e instanceof Errors.HttpError) {
                if (e.data.statusCode === 401) {
                    throw new AuthorizationError(
                        'Git credentials not recognized',
                        e.data,
                    );
                }
                if (e.data.statusCode === 404) {
                    throw new NotFoundError(`No git repository found`);
                }
                throw new UnexpectedGitError(
                    `Unexpected error while cloning git repository: ${e.message}`,
                    e.data,
                );
            }
            if (e instanceof Errors.NotFoundError) {
                throw new NotFoundError(e.message);
            }
            throw new UnexpectedGitError(
                `Unexpected error while cloning git repository: ${e}`,
            );
        }
    }

    private async _pull() {
        try {
            await git.pull({
                fs,
                http,
                dir: this.localRepositoryDir,
                url: this.remoteRepositoryUrl,
                singleBranch: true,
                fastForwardOnly: true,
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
