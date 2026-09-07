import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
    getErrorMessage,
    SupportedDbtVersions,
    UnexpectedGitError,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { createHash } from 'crypto';
import fs from 'fs';
import * as fspromises from 'fs/promises';
import * as yaml from 'js-yaml';
import os from 'os';
import * as path from 'path';
import { performance } from 'perf_hooks';
import simpleGit, { SimpleGitProgressEvent } from 'simple-git';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { DbtCliClient } from '../dbt/dbtCliClient';
import { getDbtProcessEnvironment } from '../dbt/dbtProcessEnvironment';
import Logger from '../logging/logger';
import {
    CachedWarehouse,
    ProjectAdapter,
    type ExploreCompileOptions,
    type TrackingParams,
} from '../types';
import {
    acquireDbtGitProjectCache,
    DbtGitCacheIdentity,
    DbtGitCacheLease,
    invalidateOwnedDbtGitCacheLease,
    releaseDbtGitProjectCache,
} from './dbtGitProjectCache';
import { inspectDbtGitProject } from './dbtGitProjectInspection';
import { DbtLocalCredentialsProjectAdapter } from './dbtLocalCredentialsProjectAdapter';
import { gitErrorHandler } from './gitRepository';

export type DbtGitProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    remoteRepositoryUrl: string;
    repository: string;
    gitBranch: string;
    projectDirectorySubPath: string;
    warehouseCredentials: CreateWarehouseCredentials;
    targetName: string | undefined;
    environment: DbtProjectEnvironmentVariable[] | undefined;
    environmentVariableAllowlist: string[];
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    selector?: string;
    analytics?: LightdashAnalytics;
    gitConfigGlobalPath?: string;
    dbtDepsErrorHint?: string;
    cacheIdentity?: DbtGitCacheIdentity;
    credential?: {
        token: string;
        installationId?: string;
    };
};

export type DbtGitFetchMetrics = {
    cloneMode: 'fresh' | 'reused';
    depsMode: 'fresh' | 'reused';
    cloneDurationMs: number;
    depsDurationMs: number;
};

export type DbtGitCacheOutcome = {
    cloneMode: 'fresh' | 'reused';
    depsMode: 'fresh' | 'reused';
    missReason: string | null;
    fallbackReason: string | null;
    retainCheckout: boolean;
    eligible: boolean | null;
    eligibilityReason: string | null;
    inspectionDurationMs: number;
    cleanupDurationMs: number;
    retained: boolean | null;
    retentionReason: string | null;
};

type DependencyLayout = {
    eligible: boolean;
    installDirectory: string;
    hasDeclaredPackages: boolean;
    hash: string;
    inputHash: string;
};

type DependencyMarker = {
    version: number;
    hash: string;
    hasDeclaredPackages: boolean;
    inputHash: string;
};

const DEPENDENCY_MARKER_VERSION = 1;
const CACHE_FETCH_REF = 'refs/lightdash/cache';
const PACKAGE_CONFIG_FILES = [
    'packages.yml',
    'dependencies.yml',
    'package-lock.yml',
    'dbt_project.yml',
] as const;

const stripTokensFromUrls = (raw: string) => {
    const pattern = /\/\/(.*)@/g;
    return raw.replace(pattern, '//*****@');
};

const sanitizedError = (error: unknown, sensitiveValues: string[]) => {
    const source =
        error instanceof Error ? error.message : getErrorMessage(error);
    const message = sensitiveValues
        .filter(Boolean)
        .flatMap((value) => [value, encodeURIComponent(value)])
        .reduce(
            (result, value) => result.replaceAll(value, '*****'),
            stripTokensFromUrls(source),
        );
    return {
        name: error instanceof Error ? error.name : 'UnknownError',
        message,
        ...((error as NodeJS.ErrnoException | undefined)?.code
            ? { code: (error as NodeJS.ErrnoException).code }
            : {}),
    };
};

const isMissingFileError = (error: unknown): boolean =>
    (error as NodeJS.ErrnoException).code === 'ENOENT';

export const assertValidGitBranch = (branch: string): void => {
    if (branch.startsWith('-')) {
        throw new UnexpectedGitError(
            'Git branch names must not begin with an option prefix',
        );
    }
};
const withoutCredentials = (
    remoteRepositoryUrl: string,
    repository: string,
): string => {
    try {
        const parsed = new URL(remoteRepositoryUrl);
        if (
            !['http:', 'https:', 'file:'].includes(parsed.protocol) ||
            parsed.search ||
            parsed.hash ||
            (parsed.protocol === 'file:' &&
                (parsed.username || parsed.password))
        ) {
            throw new Error('Unsupported Git repository protocol');
        }
        parsed.username = '';
        parsed.password = '';
        return parsed.href;
    } catch (error) {
        return gitErrorHandler(error, repository);
    }
};

const decodedUrlCredentials = (remoteRepositoryUrl: string): string[] => {
    const parsed = new URL(remoteRepositoryUrl);
    return [parsed.username, parsed.password]
        .filter((value) => value !== '')
        .map((value) => decodeURIComponent(value));
};

const isContainedRelativePath = (value: string): boolean => {
    if (path.isAbsolute(value)) return false;
    const resolved = path.resolve('/cache-root', value || '.');
    return resolved === '/cache-root' || resolved.startsWith('/cache-root/');
};

const readRegularFile = async (
    filePath: string,
): Promise<{ safe: boolean; content: string | null }> => {
    try {
        const stat = await fspromises.lstat(filePath);
        if (!stat.isFile() || stat.isSymbolicLink()) {
            return { safe: false, content: null };
        }
        return {
            safe: true,
            content: await fspromises.readFile(filePath, 'utf8'),
        };
    } catch (error) {
        if (isMissingFileError(error)) {
            return { safe: true, content: null };
        }
        throw error;
    }
};

const containsUnsafeDependency = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(containsUnsafeDependency);
    if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).some(
            ([key, child]) =>
                ['local', 'path'].includes(key.toLowerCase()) ||
                containsUnsafeDependency(child),
        );
    }
    return (
        typeof value === 'string' &&
        (value.includes('{{') || value.includes('{%'))
    );
};

const literalGitCleanExclusion = (
    relativePath: string,
    directory: boolean,
): string => {
    const normalizedPath = relativePath.split(path.sep).join('/');
    const escapedPath = normalizedPath.replace(/[\\*?[\]!# ]/g, '\\$&');
    return `/${escapedPath}${directory ? '/' : ''}`;
};

const FILESYSTEM_BATCH_SIZE = 32;

const directoryContentDigest = async (
    directory: string,
    normalizeDirectoryPath = false,
): Promise<string> => {
    const hash = createHash('sha256');
    const pending = [directory];
    const files: Array<{ path?: string; relative: string }> = [];
    const scanBatch = async (): Promise<void> => {
        const batch = pending.splice(0, FILESYSTEM_BATCH_SIZE);
        if (batch.length === 0) return;
        const results = await Promise.all(
            batch.map(async (current) => ({
                current,
                entries: await fspromises.readdir(current, {
                    withFileTypes: true,
                }),
            })),
        );
        results.forEach(({ current, entries }) => {
            entries.forEach((entry) => {
                const candidate = path.join(current, entry.name);
                const relative = path.relative(directory, candidate);
                if (entry.isDirectory()) {
                    pending.push(candidate);
                } else if (entry.isFile()) {
                    files.push({ path: candidate, relative });
                } else {
                    files.push({ relative: `${relative}:unsupported` });
                }
            });
        });
        await scanBatch();
    };
    await scanBatch();
    files.sort((left, right) => left.relative.localeCompare(right.relative));
    const digestBatch = async (offset: number): Promise<void> => {
        const batch = files.slice(offset, offset + FILESYSTEM_BATCH_SIZE);
        if (batch.length === 0) return;
        const contents = await Promise.all(
            batch.map(({ path: filePath }) =>
                filePath ? fspromises.readFile(filePath) : undefined,
            ),
        );
        batch.forEach(({ relative }, index) => {
            hash.update(relative);
            if (contents[index]) {
                hash.update(
                    normalizeDirectoryPath
                        ? contents[index]!.toString('utf8').replaceAll(
                              directory,
                              '__temporary_directory__',
                          )
                        : contents[index]!,
                );
            }
        });
        await digestBatch(offset + FILESYSTEM_BATCH_SIZE);
    };
    await digestBatch(0);
    return hash.digest('hex');
};
export class DbtGitProjectAdapter
    extends DbtLocalCredentialsProjectAdapter
    implements ProjectAdapter
{
    localRepositoryDir: string;

    remoteRepositoryUrl: string;

    repository: string;

    projectDirectorySubPath: string;

    branch: string;

    private readonly cleanRemoteRepositoryUrl: string;

    private readonly repositoryIdentity: string;

    private readonly cacheIdentity: DbtGitCacheIdentity | undefined;

    private readonly credential:
        | { token: string; installationId?: string }
        | undefined;

    private readonly temporaryRepositoryDirectories = new Set<string>();

    private cacheLease: DbtGitCacheLease | undefined;

    private refreshed = false;

    private refreshAttempted = false;

    private retainCheckout = true;

    private readonly sensitiveValues: string[];

    private cacheOutcome: DbtGitCacheOutcome = {
        cloneMode: 'fresh',
        depsMode: 'fresh',
        missReason: null,
        fallbackReason: null,
        retainCheckout: true,
        eligible: null,
        eligibilityReason: null,
        inspectionDurationMs: 0,
        cleanupDurationMs: 0,
        retained: null,
        retentionReason: null,
    };

    private cacheOutcomeLogged = false;

    private fetchMetrics: DbtGitFetchMetrics = {
        cloneMode: 'fresh',
        depsMode: 'fresh',
        cloneDurationMs: 0,
        depsDurationMs: 0,
    };

    constructor({
        warehouseClient,
        repository,
        remoteRepositoryUrl,
        gitBranch,
        projectDirectorySubPath,
        warehouseCredentials,
        targetName,
        environment,
        environmentVariableAllowlist,
        cachedWarehouse,
        dbtVersion,
        selector,
        analytics,
        gitConfigGlobalPath,
        dbtDepsErrorHint,
        cacheIdentity,
        credential,
    }: DbtGitProjectAdapterArgs) {
        assertValidGitBranch(gitBranch);
        const cleanRemoteRepositoryUrl = withoutCredentials(
            remoteRepositoryUrl,
            repository,
        );
        let credentialMatchesUrl = true;
        if (credential) {
            try {
                const urlCredentials =
                    decodedUrlCredentials(remoteRepositoryUrl);
                credentialMatchesUrl =
                    credential.token === ''
                        ? urlCredentials.length === 0
                        : urlCredentials.includes(credential.token);
            } catch {
                credentialMatchesUrl = false;
            }
            if (!credentialMatchesUrl) {
                Logger.warn(
                    'Git credential URL validation failed; checkout cache disabled',
                );
            }
        }
        const localRepositoryDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'git_'),
        );
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
            environmentVariableAllowlist,
            cachedWarehouse,
            dbtVersion,
            selector,
            analytics,
            gitConfigGlobalPath,
            dbtDepsErrorHint,
        });
        this.projectDirectorySubPath = projectDirectorySubPath;
        this.localRepositoryDir = localRepositoryDir;
        this.temporaryRepositoryDirectories.add(localRepositoryDir);
        this.remoteRepositoryUrl = remoteRepositoryUrl;
        this.credential = credential;
        this.sensitiveValues = credential
            ? [credential.token]
            : (() => {
                  try {
                      return decodedUrlCredentials(remoteRepositoryUrl);
                  } catch {
                      return [];
                  }
              })();
        this.cleanRemoteRepositoryUrl = cleanRemoteRepositoryUrl;
        this.branch = gitBranch;
        this.repository = repository;
        this.cacheIdentity =
            credentialMatchesUrl &&
            cacheIdentity &&
            isContainedRelativePath(projectDirectorySubPath)
                ? cacheIdentity
                : undefined;
        if (!credentialMatchesUrl) {
            this.cacheOutcome.missReason = 'credential-url-mismatch';
        } else if (!cacheIdentity) {
            this.cacheOutcome.missReason = 'cache-identity-unavailable';
        } else if (!isContainedRelativePath(projectDirectorySubPath)) {
            this.cacheOutcome.missReason = 'project-subpath-ineligible';
        }
        const parsedRemote = new URL(this.cleanRemoteRepositoryUrl);
        this.repositoryIdentity = JSON.stringify({
            authority: parsedRemote.host,
            path: parsedRemote.pathname,
            branch: gitBranch,
            projectSubPath: path.normalize(projectDirectorySubPath || '.'),
        });
        const installDeps = this.dbtClient.installDeps?.bind(this.dbtClient);
        if (installDeps) {
            this.dbtClient.installDeps = () =>
                this.installDepsWithCache(installDeps);
        }
    }

    getFetchMetrics(): DbtGitFetchMetrics {
        return { ...this.fetchMetrics };
    }

    getCacheOutcome(): DbtGitCacheOutcome {
        return {
            ...this.cacheOutcome,
            cloneMode: this.fetchMetrics.cloneMode,
            depsMode: this.fetchMetrics.depsMode,
            retainCheckout: this.retainCheckout,
        };
    }

    private warnSwallowedError(message: string, error: unknown) {
        Logger.warn(message, {
            error: sanitizedError(error, this.sensitiveValues),
        });
    }

    private git() {
        const authenticationEnvironment =
            this.remoteRepositoryUrl === this.cleanRemoteRepositoryUrl
                ? { GIT_CONFIG_COUNT: '0' }
                : {
                      GIT_CONFIG_COUNT: '1',
                      GIT_CONFIG_KEY_0: `url.${this.remoteRepositoryUrl}.insteadOf`,
                      GIT_CONFIG_VALUE_0: this.cleanRemoteRepositoryUrl,
                  };
        return simpleGit({
            unsafe: { allowUnsafeConfigEnvCount: true },
            progress({ method, stage, progress }: SimpleGitProgressEvent) {
                Logger.debug(
                    `git.${method} ${stage} stage ${progress}% complete`,
                );
            },
        }).env({
            GIT_TERMINAL_PROMPT: '0',
            ...authenticationEnvironment,
        });
    }

    private setRepositoryDirectory(directory: string) {
        this.localRepositoryDir = directory;
        this.dbtProjectDir = path.join(directory, this.projectDirectorySubPath);
        (this.dbtClient as DbtCliClient).dbtProjectDirectory =
            this.dbtProjectDir;
    }

    private async removeTemporaryRepositoryDirectory(directory: string) {
        await fspromises.rm(directory, {
            recursive: true,
            force: true,
        });
        this.temporaryRepositoryDirectories.delete(directory);
    }

    private async dependencyLayout(): Promise<DependencyLayout> {
        if (!this.dbtProjectDir) {
            this.cacheOutcome.eligible = false;
            this.cacheOutcome.eligibilityReason = 'project-directory-missing';
            return {
                eligible: false,
                installDirectory: '',
                hasDeclaredPackages: false,
                hash: '',
                inputHash: '',
            };
        }
        try {
            const repositoryRealPath = await fspromises.realpath(
                this.localRepositoryDir,
            );
            const projectRealPath = await fspromises.realpath(
                this.dbtProjectDir,
            );
            const relativeProject = path.relative(
                repositoryRealPath,
                projectRealPath,
            );
            if (
                relativeProject.startsWith('..') ||
                path.isAbsolute(relativeProject)
            ) {
                throw new Error('Project path escapes checkout');
            }
            const files = await Promise.all(
                PACKAGE_CONFIG_FILES.map((name) =>
                    readRegularFile(path.join(projectRealPath, name)),
                ),
            );
            if (files.some((file) => !file.safe)) {
                throw new Error('Unsafe package configuration path');
            }
            const [packagesFile, dependenciesFile, , projectFile] = files;
            const parsedPackages = packagesFile.content
                ? yaml.load(packagesFile.content)
                : null;
            const parsedDependencies = dependenciesFile.content
                ? yaml.load(dependenciesFile.content)
                : null;
            const parsedProject = projectFile.content
                ? yaml.load(projectFile.content)
                : null;
            if (
                containsUnsafeDependency(parsedPackages) ||
                containsUnsafeDependency(parsedDependencies)
            ) {
                throw new Error('Dynamic or local package configuration');
            }
            const configuredInstallPath =
                parsedProject && typeof parsedProject === 'object'
                    ? (parsedProject as Record<string, unknown>)[
                          'packages-install-path'
                      ]
                    : undefined;
            const installPath = configuredInstallPath ?? 'dbt_packages';
            if (
                typeof installPath !== 'string' ||
                installPath.trim() === '' ||
                installPath === '.' ||
                !isContainedRelativePath(installPath) ||
                installPath.includes('{{') ||
                installPath.includes('{%') ||
                /[*?[\]]/.test(installPath)
            ) {
                throw new Error('Unsafe package install path');
            }
            const installDirectory = path.resolve(projectRealPath, installPath);
            const relativeInstall = path.relative(
                projectRealPath,
                installDirectory,
            );
            if (
                relativeInstall === '' ||
                relativeInstall.startsWith('..') ||
                path.isAbsolute(relativeInstall)
            ) {
                throw new Error('Package path escapes project');
            }
            const installStat = await fspromises
                .lstat(installDirectory)
                .catch((error) => {
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                        return undefined;
                    }
                    throw error;
                });
            if (
                installStat &&
                (!installStat.isDirectory() || installStat.isSymbolicLink())
            ) {
                throw new Error('Unsafe package install directory');
            }
            if (installStat) {
                const realInstall = await fspromises.realpath(installDirectory);
                const realInstallRelative = path.relative(
                    projectRealPath,
                    realInstall,
                );
                if (
                    realInstallRelative === '' ||
                    realInstallRelative.startsWith('..') ||
                    path.isAbsolute(realInstallRelative)
                ) {
                    throw new Error(
                        'Package install directory escapes project',
                    );
                }
            }
            const hasDeclaredPackages = [
                parsedPackages,
                parsedDependencies,
            ].some(
                (value) =>
                    value !== null &&
                    value !== undefined &&
                    (typeof value !== 'object' ||
                        Object.keys(value as object).length > 0),
            );
            const client = this.dbtClient as DbtCliClient;
            const effectiveEnvironment = getDbtProcessEnvironment({
                processEnvironment: process.env,
                environmentVariableAllowlist:
                    client.environmentVariableAllowlist,
                projectEnvironment: client.environment,
                targetPath: '__excluded_target_path__',
                gitConfigGlobalPath: client.gitConfigGlobalPath,
            });
            delete effectiveEnvironment.DBT_TARGET_PATH;
            delete effectiveEnvironment.GIT_CONFIG_GLOBAL;
            const parsedRemote = new URL(this.remoteRepositoryUrl);
            const parsedUsername = parsedRemote.username
                ? decodeURIComponent(parsedRemote.username)
                : '';
            const explicitCredentialIdentity = this.credential
                ? {
                      scheme: parsedRemote.protocol,
                      host: parsedRemote.host,
                      username:
                          parsedUsername === this.credential.token
                              ? ''
                              : parsedUsername,
                      installationId: this.credential.installationId ?? null,
                      tokenHash:
                          this.credential.token &&
                          !this.credential.installationId
                              ? createHash('sha256')
                                    .update(this.credential.token)
                                    .digest('hex')
                              : null,
                  }
                : undefined;
            const credentialHashBuilder = createHash('sha256')
                .update(
                    explicitCredentialIdentity
                        ? JSON.stringify(explicitCredentialIdentity)
                        : this.remoteRepositoryUrl,
                )
                .update(
                    await directoryContentDigest(client.dbtProfilesDirectory),
                );
            if (!explicitCredentialIdentity) {
                credentialHashBuilder.update(
                    client.gitConfigGlobalPath
                        ? await directoryContentDigest(
                              path.dirname(client.gitConfigGlobalPath),
                              true,
                          )
                        : '',
                );
            }
            const credentialHash = credentialHashBuilder.digest('hex');
            const inputs = {
                files: files.map((file, index) => ({
                    name: PACKAGE_CONFIG_FILES[index],
                    content: file.content,
                })),
                dbtVersion: client.dbtVersion,
                target: client.target ?? null,
                profileName: client.profileName ?? null,
                installPath,
                environment: Object.entries(effectiveEnvironment).sort(
                    ([left], [right]) => left.localeCompare(right),
                ),
                credentialHash,
            };
            const hash = createHash('sha256')
                .update(JSON.stringify(inputs))
                .digest('hex');
            const inputHash = createHash('sha256')
                .update(
                    JSON.stringify({
                        ...inputs,
                        files: inputs.files.filter(
                            ({ name }) => name !== 'package-lock.yml',
                        ),
                    }),
                )
                .digest('hex');
            this.cacheOutcome.eligible = true;
            this.cacheOutcome.eligibilityReason = null;
            return {
                eligible: true,
                installDirectory,
                hasDeclaredPackages,
                hash,
                inputHash,
            };
        } catch (error) {
            this.cacheOutcome.eligible = false;
            this.cacheOutcome.eligibilityReason = sanitizedError(
                error,
                this.sensitiveValues,
            ).message;
            this.warnSwallowedError(
                'Dbt Git dependency layout is not cacheable',
                error,
            );
            return {
                eligible: false,
                installDirectory: '',
                hasDeclaredPackages: false,
                hash: '',
                inputHash: '',
            };
        }
    }

    private async installDepsWithCache(installDeps: () => Promise<void>) {
        const startedAt = Date.now();
        const before = await this.dependencyLayout();
        if (this.cacheLease?.reused && before.eligible) {
            const marker = await this.readDependencyMarker();
            const packageDirectoryExists = before.hasDeclaredPackages
                ? await fspromises
                      .lstat(before.installDirectory)
                      .then(
                          (stat) =>
                              stat.isDirectory() && !stat.isSymbolicLink(),
                      )
                      .catch((error) => {
                          if (!isMissingFileError(error)) {
                              this.warnSwallowedError(
                                  'Failed to inspect cached dbt package directory',
                                  error,
                              );
                          }
                          return false;
                      })
                : true;
            if (
                marker?.version === DEPENDENCY_MARKER_VERSION &&
                marker.hash === before.hash &&
                marker.inputHash === before.inputHash &&
                marker.hasDeclaredPackages === before.hasDeclaredPackages &&
                packageDirectoryExists
            ) {
                this.fetchMetrics.depsMode = 'reused';
                this.fetchMetrics.depsDurationMs = Date.now() - startedAt;
                return;
            }
        }
        if (this.cacheLease) {
            await fspromises
                .rm(this.cacheLease.depsMarkerPath, { force: true })
                .catch((error) => {
                    this.retainCheckout = false;
                    this.warnSwallowedError(
                        'Failed to remove dbt dependency cache marker',
                        error,
                    );
                });
        }
        try {
            await installDeps();
        } finally {
            this.fetchMetrics.depsDurationMs = Date.now() - startedAt;
        }
        this.fetchMetrics.depsMode = 'fresh';
        const after = await this.dependencyLayout();
        if (this.cacheLease && after.eligible) {
            try {
                const temporaryPath = `${this.cacheLease.depsMarkerPath}.tmp`;
                await fspromises.writeFile(
                    temporaryPath,
                    JSON.stringify({
                        version: DEPENDENCY_MARKER_VERSION,
                        hash: after.hash,
                        hasDeclaredPackages: after.hasDeclaredPackages,
                        inputHash: after.inputHash,
                    } satisfies DependencyMarker),
                    { mode: 0o600 },
                );
                await fspromises.rename(
                    temporaryPath,
                    this.cacheLease.depsMarkerPath,
                );
            } catch (error) {
                this.retainCheckout = false;
                this.warnSwallowedError(
                    'Failed to write dbt dependency cache marker',
                    error,
                );
            }
        } else if (!after.eligible) {
            this.retainCheckout = false;
        }
    }

    private async readDependencyMarker(): Promise<
        DependencyMarker | undefined
    > {
        if (!this.cacheLease) return undefined;
        try {
            return JSON.parse(
                await fspromises.readFile(
                    this.cacheLease.depsMarkerPath,
                    'utf8',
                ),
            ) as DependencyMarker;
        } catch (error) {
            if (!isMissingFileError(error)) {
                this.warnSwallowedError(
                    'Failed to read dbt dependency cache marker',
                    error,
                );
            }
            return undefined;
        }
    }

    private async cleanReusedCheckout() {
        const layout = await this.dependencyLayout();
        if (!layout.eligible) {
            throw new Error('Unsafe cached dependency layout');
        }
        const marker = await this.readDependencyMarker();
        const exclusions =
            marker?.inputHash === layout.inputHash
                ? [
                      literalGitCleanExclusion(
                          path.relative(
                              this.localRepositoryDir,
                              layout.installDirectory,
                          ),
                          true,
                      ),
                      literalGitCleanExclusion(
                          path.relative(
                              this.localRepositoryDir,
                              path.join(
                                  this.dbtProjectDir!,
                                  'package-lock.yml',
                              ),
                          ),
                          false,
                      ),
                  ]
                : [];
        await this.git()
            .cwd(this.localRepositoryDir)
            .raw([
                'clean',
                '-ffdx',
                ...exclusions.flatMap((value) => ['-e', value]),
            ]);
    }

    private async cloneFresh() {
        const startedAt = Date.now();
        let cloned = false;
        try {
            await this.git().clone(
                this.cleanRemoteRepositoryUrl,
                this.localRepositoryDir,
                {
                    '--single-branch': null,
                    '--depth': 1,
                    '--branch': this.branch,
                    '--no-tags': null,
                    '--progress': null,
                },
            );
            await this.git()
                .cwd(this.localRepositoryDir)
                .remote(['set-url', 'origin', this.cleanRemoteRepositoryUrl]);
            this.fetchMetrics.cloneMode = 'fresh';
            cloned = true;
        } catch (error) {
            gitErrorHandler(error, this.repository);
        } finally {
            this.fetchMetrics.cloneDurationMs = Date.now() - startedAt;
            if (cloned) {
                Logger.info(
                    `Git clone completed in ${this.fetchMetrics.cloneDurationMs}ms`,
                );
            }
        }
    }

    private async reuseCheckout() {
        const startedAt = Date.now();
        await fspromises.rm(
            path.join(this.localRepositoryDir, '.git', 'FETCH_HEAD'),
            { force: true },
        );
        await this.git()
            .cwd(this.localRepositoryDir)
            .fetch(
                this.cleanRemoteRepositoryUrl,
                `+${this.branch}:${CACHE_FETCH_REF}`,
                {
                    '--depth': 1,
                    '--no-tags': null,
                    '--no-write-fetch-head': null,
                    '--progress': null,
                },
            );
        await this.git()
            .cwd(this.localRepositoryDir)
            .reset(['--hard', CACHE_FETCH_REF]);
        await this.cleanReusedCheckout();
        await fspromises.rm(
            path.join(this.localRepositoryDir, '.git', 'logs'),
            { recursive: true, force: true },
        );
        this.fetchMetrics.cloneMode = 'reused';
        this.fetchMetrics.cloneDurationMs = Date.now() - startedAt;
        Logger.info(
            `Git fetch completed in ${this.fetchMetrics.cloneDurationMs}ms`,
        );
    }

    private async useFreshAfterCacheFailure() {
        if (this.cacheLease) {
            const lease = this.cacheLease;
            await invalidateOwnedDbtGitCacheLease(lease).catch((error) => {
                this.warnSwallowedError(
                    'Failed to invalidate dbt Git cache checkout',
                    error,
                );
            });
            this.cacheOutcome.retained = lease.retained ?? false;
            this.cacheOutcome.retentionReason =
                lease.retentionReason ?? 'invalidated';
            this.cacheLease = undefined;
        }
        const temporaryDirectory = await fspromises.mkdtemp(
            path.join(os.tmpdir(), 'git_'),
        );
        this.temporaryRepositoryDirectories.add(temporaryDirectory);
        this.setRepositoryDirectory(temporaryDirectory);
        await this.cloneFresh();
        this.refreshed = true;
    }

    private async refreshRepo() {
        if (this.refreshed) return;
        this.refreshAttempted = true;
        const initialDirectory = this.localRepositoryDir;
        if (this.cacheIdentity) {
            try {
                this.cacheLease = await acquireDbtGitProjectCache(
                    this.cacheIdentity,
                    this.repositoryIdentity,
                    (reason) => {
                        this.cacheOutcome.missReason = reason;
                    },
                );
                if (this.cacheLease && !this.cacheLease.reused) {
                    this.cacheOutcome.missReason = 'cold';
                }
            } catch (error) {
                this.cacheOutcome.missReason = 'acquire-error';
                this.warnSwallowedError(
                    'Failed to acquire dbt Git checkout cache',
                    error,
                );
            }
        }
        if (this.cacheLease) {
            await this.removeTemporaryRepositoryDirectory(
                initialDirectory,
            ).catch((error) => {
                this.warnSwallowedError(
                    'Failed to remove temporary dbt Git checkout',
                    error,
                );
            });
            this.setRepositoryDirectory(this.cacheLease.checkoutDirectory);
            if (this.cacheLease.reused) {
                try {
                    await this.reuseCheckout();
                    this.refreshed = true;
                    return;
                } catch (error) {
                    this.cacheOutcome.fallbackReason = 'refresh-failed';
                    this.warnSwallowedError(
                        'Cached Git checkout refresh failed; using a fresh clone',
                        error,
                    );
                    await this.useFreshAfterCacheFailure();
                    return;
                }
            }
            try {
                await this.cloneFresh();
                this.refreshed = true;
                return;
            } catch (error) {
                this.cacheOutcome.fallbackReason = 'cache-clone-failed';
                this.warnSwallowedError(
                    'Cached Git checkout clone failed; using a fresh clone',
                    error,
                );
                await this.useFreshAfterCacheFailure();
                return;
            }
        }
        await this.cloneFresh();
        this.refreshed = true;
    }

    async destroy(): Promise<void> {
        const cleanupStartedAt = performance.now();
        Logger.debug('Destroy git project adapter');
        let cleanupError: unknown;
        try {
            await super.destroy();
        } catch (error) {
            cleanupError = error;
        } finally {
            if (this.cacheLease) {
                const lease = this.cacheLease;
                try {
                    if (!this.retainCheckout) {
                        await invalidateOwnedDbtGitCacheLease(lease);
                    } else {
                        let inspection:
                            | Awaited<ReturnType<typeof inspectDbtGitProject>>
                            | undefined;
                        try {
                            inspection = await inspectDbtGitProject(
                                lease.entryDirectory,
                            );
                            this.cacheOutcome.inspectionDurationMs =
                                inspection.durationMs;
                        } catch (error) {
                            this.cacheOutcome.retentionReason =
                                'inspection-failed';
                            this.warnSwallowedError(
                                'Failed to inspect dbt Git checkout cache',
                                error,
                            );
                        }
                        if (!inspection || inspection.containsCredentials) {
                            this.retainCheckout = false;
                            if (inspection?.containsCredentials) {
                                this.cacheOutcome.retentionReason =
                                    'credential-metadata';
                            }
                            await invalidateOwnedDbtGitCacheLease(lease);
                        } else {
                            await releaseDbtGitProjectCache(
                                lease,
                                inspection.sizeBytes,
                            );
                        }
                    }
                    this.cacheOutcome.retained = lease.retained ?? false;
                    this.cacheOutcome.retentionReason ??=
                        lease.retentionReason ?? null;
                } catch (error) {
                    await invalidateOwnedDbtGitCacheLease(lease).catch(
                        (invalidationError) => {
                            this.warnSwallowedError(
                                'Failed to invalidate unretained dbt Git checkout cache',
                                invalidationError,
                            );
                        },
                    );
                    this.cacheOutcome.retained = false;
                    this.cacheOutcome.retentionReason ??=
                        lease.retentionReason ?? 'retention-error';
                    this.warnSwallowedError(
                        'Failed to retain dbt Git checkout cache',
                        error,
                    );
                }
                this.cacheLease = undefined;
            } else {
                await this.removeTemporaryRepositoryDirectory(
                    this.localRepositoryDir,
                ).catch((error) => {
                    this.warnSwallowedError(
                        'Failed to remove temporary dbt Git checkout',
                        error,
                    );
                });
            }
            await Promise.all(
                [...this.temporaryRepositoryDirectories].map((directory) =>
                    this.removeTemporaryRepositoryDirectory(directory).catch(
                        (error) => {
                            this.warnSwallowedError(
                                'Failed to remove temporary dbt Git checkout',
                                error,
                            );
                        },
                    ),
                ),
            );
            this.cacheOutcome.cleanupDurationMs =
                performance.now() - cleanupStartedAt;
            if (this.refreshAttempted && !this.cacheOutcomeLogged) {
                Logger.info('dbt.git.cache.outcome', this.getCacheOutcome());
                this.cacheOutcomeLogged = true;
            }
        }
        if (cleanupError) throw cleanupError;
    }

    public async prepareExploreStream(
        trackingParams?: TrackingParams,
        loadSources?: boolean,
        allowPartialCompilation?: boolean,
        compileOptions?: ExploreCompileOptions,
    ) {
        await this.refreshRepo();
        return super.prepareExploreStream(
            trackingParams,
            loadSources,
            allowPartialCompilation,
            compileOptions,
        );
    }

    public async test() {
        await this.refreshRepo();
        await super.test();
    }

    public async getDbtManifest() {
        await this.refreshRepo();
        return super.getDbtManifest();
    }
}
