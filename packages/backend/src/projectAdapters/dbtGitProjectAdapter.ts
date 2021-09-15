import tempy from 'tempy';
import * as path from 'path';
import * as git from 'isomorphic-git';
import * as fspromises from 'fs/promises';
import * as fs from 'fs';
import * as http from 'isomorphic-git/http/node';
import { DbtLocalProjectAdapter } from './dbtLocalProjectAdapter';
import { UnexpectedServerError } from '../errors';

export class DbtGitProjectAdapter extends DbtLocalProjectAdapter {
    localRepositoryDir: string;

    remoteRepositoryUrl: string;

    branch: string;

    constructor(
        remoteRepositoryUrl: string,
        githubBranch: string,
        projectDirectorySubPath: string,
        profilesDirectorySubPath: string,
        port: number,
        target: string | undefined,
    ) {
        const localRepositoryDir = tempy.directory();
        const projectDir = path.join(
            localRepositoryDir,
            projectDirectorySubPath,
        );
        const profilesDir = path.join(
            localRepositoryDir,
            profilesDirectorySubPath,
        );
        super(projectDir, profilesDir, port, target);
        this.localRepositoryDir = localRepositoryDir;
        this.remoteRepositoryUrl = remoteRepositoryUrl;
        this.branch = githubBranch;
    }

    private async _cleanLocal() {
        try {
            const contents = await fspromises.readdir(this.localRepositoryDir);
            await Promise.all(
                contents.map(async (filename) => {
                    await fspromises.rm(
                        path.join(this.localRepositoryDir, filename),
                        { recursive: true, force: true },
                    );
                }),
            );
        } catch (e) {
            throw new UnexpectedServerError(
                `Unexpected error while processing git repository: ${e}`,
            );
        }
    }

    private async _clone() {
        await this._cleanLocal();
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
            await this._clone();
        }
    }

    public async compileAllExplores() {
        await this._refreshRepo();
        const results = await super.compileAllExplores();
        return results;
    }
}
