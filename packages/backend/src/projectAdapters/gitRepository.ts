/**
 * Minimal git clone helper, decoupled from any compiler (dbt or Lightdash YAML).
 *
 * Extracted so a non-dbt adapter can materialise a repo without inheriting the
 * dbt adapter chain. Productionisation: DbtGitProjectAdapter's own clone logic
 * should be refactored onto this so dbt and YAML share a single clone (today
 * the dbt branch re-clones — see GitProjectAdapter).
 */
import { getErrorMessage, UnexpectedGitError } from '@lightdash/common';
import fs from 'fs';
import * as fspromises from 'fs-extra';
import * as path from 'path';
import simpleGit, { type SimpleGit } from 'simple-git';
import Logger from '../logging/logger';

/**
 * Redact `//user:token@host` credentials from any string before it can reach a
 * log or error surface. Mirrors `stripTokensFromUrls` in dbtGitProjectAdapter —
 * productionisation should unify the two into a shared git-error helper.
 */
const stripCredentials = (raw: string): string =>
    raw.replace(/(https?:\/\/)[^@\s/]+@/gi, '$1*****@');

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
        try {
            await this.git
                .env('GIT_TERMINAL_PROMPT', '0')
                .clone(this.remoteRepositoryUrl, this.localRepositoryDir, {
                    '--single-branch': null,
                    '--depth': 1,
                    '--branch': this.branch,
                    '--no-tags': null,
                });
        } catch (e) {
            // simple-git errors can include the clone command (and thus the
            // tokenised remote URL); strip credentials before it propagates.
            throw new UnexpectedGitError(
                `Git clone failed: ${stripCredentials(getErrorMessage(e))}`,
            );
        }
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
