/**
 * Minimal git clone helper, decoupled from any compiler (dbt or Lightdash YAML).
 *
 * Extracted so a non-dbt adapter can materialise a repo without inheriting the
 * dbt adapter chain. Productionisation: DbtGitProjectAdapter's own clone logic
 * should be refactored onto this so dbt and YAML share a single clone (today
 * the dbt branch re-clones — see GitProjectAdapter).
 */
import fs from 'fs';
import * as fspromises from 'fs-extra';
import * as path from 'path';
import simpleGit, { type SimpleGit } from 'simple-git';
import Logger from '../logging/logger';

export class GitRepository {
    private readonly localRepositoryDir: string;

    private readonly projectDir: string;

    private readonly git: SimpleGit;

    constructor(
        private readonly remoteRepositoryUrl: string,
        private readonly branch: string,
        projectDirectorySubPath: string,
    ) {
        this.localRepositoryDir = fs.mkdtempSync('/tmp/git_');
        this.projectDir = path.join(
            this.localRepositoryDir,
            projectDirectorySubPath,
        );
        this.git = simpleGit();
    }

    async clone(): Promise<string> {
        const startTime = Date.now();
        await this.git
            .env('GIT_TERMINAL_PROMPT', '0')
            .clone(this.remoteRepositoryUrl, this.localRepositoryDir, {
                '--single-branch': null,
                '--depth': 1,
                '--branch': this.branch,
                '--no-tags': null,
            });
        Logger.info(`Git clone completed in ${Date.now() - startTime}ms`);
        return this.projectDir;
    }

    getProjectDir(): string {
        return this.projectDir;
    }

    async destroy(): Promise<void> {
        await fspromises.rm(this.localRepositoryDir, {
            recursive: true,
            force: true,
        });
    }
}
