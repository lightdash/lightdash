import tempy from 'tempy';
import * as path from 'path';
import * as git from 'isomorphic-git';
import * as fspromises from 'fs/promises';
import * as fs from 'fs';
import * as http from 'isomorphic-git/http/node';
import { CreateWarehouseCredentials } from 'common';
import { UnexpectedServerError } from '../errors';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';
import { QueryRunner } from '../types';

export type DbtGitProjectAdapterArgs = {
    queryRunner: QueryRunner | undefined;
    remoteRepositoryUrl: string;
    gitBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    port: number;
};

export class DbtGitProjectAdapter extends DbtLocalCredentialsProjectAdapter {
    localRepositoryDir: string;

    remoteRepositoryUrl: string;

    branch: string;

    constructor({
        queryRunner,
        remoteRepositoryUrl,
        gitBranch,
        projectDirectorySubPath,
        warehouseCredentials,
        port,
    }: DbtGitProjectAdapterArgs) {
        const localRepositoryDir = tempy.directory();
        const projectDir = path.join(
            localRepositoryDir,
            projectDirectorySubPath,
        );
        super({
            queryRunner,
            projectDir,
            warehouseCredentials,
            port,
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
                `Unexpected error while processing git repository: ${e}`,
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
            throw new UnexpectedServerError(
                `Unexpected error while processing git repository: ${e}`,
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
            throw new UnexpectedServerError(
                `Unexpected error while processing git repository: ${e}`,
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
        const results = await super.compileAllExplores();
        return results;
    }

    public async test() {
        await this._refreshRepo();
        await super.test();
    }
}
