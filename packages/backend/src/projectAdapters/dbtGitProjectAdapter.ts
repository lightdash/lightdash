import {
    CreateWarehouseCredentials,
    DbtProjectEnvironmentVariable,
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
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { safe: true, content: null };
        }
        return { safe: false, content: null };
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

const directorySize = async (directory: string): Promise<number> => {
    let total = 0;
    const pending = [directory];
    const processBatch = async (): Promise<void> => {
        const batch = pending.splice(0, FILESYSTEM_BATCH_SIZE);
        if (batch.length === 0) return;
        const results = await Promise.all(
            batch.map(async (candidate) => {
                const stat = await fspromises.lstat(candidate);
                const children =
                    stat.isDirectory() && !stat.isSymbolicLink()
                        ? await fspromises.readdir(candidate)
                        : [];
                return { candidate, children, size: stat.size };
            }),
        );
        results.forEach(({ candidate, children, size }) => {
            total += size;
            pending.push(
                ...children.map((child) => path.join(candidate, child)),
            );
        });
        await processBatch();
    };
    await processBatch();
    return total;
};

const gitMetadataContainsCredentials = async (
    root: string,
): Promise<boolean> => {
    const found: string[] = [];
    const pending = [{ directory: root, gitMetadata: false }];
    const scanBatch = async (): Promise<void> => {
        const batch = pending.splice(0, FILESYSTEM_BATCH_SIZE);
        if (batch.length === 0) return;
        const results = await Promise.all(
            batch.map(async (item) => ({
                ...item,
                entries: await fspromises.readdir(item.directory, {
                    withFileTypes: true,
                }),
            })),
        );
        results.forEach(({ directory, entries, gitMetadata }) => {
            entries.forEach((entry) => {
                const candidate = path.join(directory, entry.name);
                if (gitMetadata) {
                    if (entry.name !== 'objects' && entry.name !== 'index') {
                        if (entry.isDirectory()) {
                            pending.push({
                                directory: candidate,
                                gitMetadata: true,
                            });
                        } else if (entry.isFile()) {
                            found.push(candidate);
                        } else {
                            throw new Error('Unsupported Git metadata');
                        }
                    }
                } else if (entry.name === '.git') {
                    if (entry.isDirectory() && !entry.isSymbolicLink()) {
                        pending.push({
                            directory: candidate,
                            gitMetadata: true,
                        });
                    } else {
                        throw new Error('Git indirection is not cacheable');
                    }
                } else if (entry.isDirectory() && !entry.isSymbolicLink()) {
                    pending.push({
                        directory: candidate,
                        gitMetadata: false,
                    });
                }
            });
        });
        await scanBatch();
    };
    await scanBatch();
    const remaining = [...found];
    const inspectBatch = async (): Promise<boolean> => {
        const batch = remaining.splice(0, FILESYSTEM_BATCH_SIZE);
        if (batch.length === 0) return false;
        const matches = await Promise.all(
            batch.map(async (file) => {
                const stat = await fspromises.lstat(file);
                if (stat.size > 1024 * 1024) return true;
                const content = await fspromises.readFile(file, 'utf8');
                return /https?:\/\/[^\s/@]+(?::[^\s/@]*)?@/i.test(content);
            }),
        );
        return matches.some(Boolean) || inspectBatch();
    };
    return inspectBatch();
};

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

    private retainCheckout = true;

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
        this.cleanRemoteRepositoryUrl = cleanRemoteRepositoryUrl;
        this.branch = gitBranch;
        this.repository = repository;
        this.cacheIdentity =
            credentialMatchesUrl &&
            cacheIdentity &&
            isContainedRelativePath(projectDirectorySubPath)
                ? cacheIdentity
                : undefined;
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
            return {
                eligible: true,
                installDirectory,
                hasDeclaredPackages,
                hash,
                inputHash,
            };
        } catch {
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
            const marker = await fspromises
                .readFile(this.cacheLease.depsMarkerPath, 'utf8')
                .then((value) => JSON.parse(value) as DependencyMarker)
                .catch(() => undefined);
            const packageDirectoryExists = before.hasDeclaredPackages
                ? await fspromises
                      .lstat(before.installDirectory)
                      .then(
                          (stat) =>
                              stat.isDirectory() && !stat.isSymbolicLink(),
                      )
                      .catch(() => false)
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
                .catch(() => {
                    this.retainCheckout = false;
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
            } catch {
                this.retainCheckout = false;
            }
        } else if (!after.eligible) {
            this.retainCheckout = false;
        }
    }

    private async cleanReusedCheckout() {
        const layout = await this.dependencyLayout();
        if (!layout.eligible) {
            throw new Error('Unsafe cached dependency layout');
        }
        const marker = this.cacheLease
            ? await fspromises
                  .readFile(this.cacheLease.depsMarkerPath, 'utf8')
                  .then((value) => JSON.parse(value) as DependencyMarker)
                  .catch(() => undefined)
            : undefined;
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
        } catch (error) {
            gitErrorHandler(error, this.repository);
        } finally {
            this.fetchMetrics.cloneDurationMs = Date.now() - startedAt;
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
    }

    private async useFreshAfterCacheFailure() {
        if (this.cacheLease) {
            await invalidateOwnedDbtGitCacheLease(this.cacheLease).catch(
                () => undefined,
            );
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
        const initialDirectory = this.localRepositoryDir;
        if (this.cacheIdentity) {
            this.cacheLease = await acquireDbtGitProjectCache(
                this.cacheIdentity,
                this.repositoryIdentity,
            ).catch(() => undefined);
        }
        if (this.cacheLease) {
            await this.removeTemporaryRepositoryDirectory(
                initialDirectory,
            ).catch(() => undefined);
            this.setRepositoryDirectory(this.cacheLease.checkoutDirectory);
            if (this.cacheLease.reused) {
                try {
                    await this.reuseCheckout();
                    this.refreshed = true;
                    return;
                } catch {
                    Logger.debug(
                        'Cached git checkout refresh failed; using a fresh clone',
                    );
                    await this.useFreshAfterCacheFailure();
                    return;
                }
            }
            try {
                await this.cloneFresh();
                this.refreshed = true;
                return;
            } catch {
                Logger.debug(
                    'Cached git checkout clone failed; using a fresh clone',
                );
                await this.useFreshAfterCacheFailure();
                return;
            }
        }
        await this.cloneFresh();
        this.refreshed = true;
    }

    private async containsRetainedCredentials(): Promise<boolean> {
        return gitMetadataContainsCredentials(this.localRepositoryDir);
    }

    async destroy(): Promise<void> {
        Logger.debug('Destroy git project adapter');
        let cleanupError: unknown;
        try {
            await super.destroy();
        } catch (error) {
            cleanupError = error;
        } finally {
            if (this.cacheLease) {
                try {
                    if (
                        !this.retainCheckout ||
                        (await this.containsRetainedCredentials().catch(
                            () => true,
                        ))
                    ) {
                        await invalidateOwnedDbtGitCacheLease(this.cacheLease);
                    } else {
                        const sizeBytes = await directorySize(
                            this.cacheLease.entryDirectory,
                        );
                        await releaseDbtGitProjectCache(
                            this.cacheLease,
                            sizeBytes,
                        );
                    }
                } catch (error) {
                    await invalidateOwnedDbtGitCacheLease(
                        this.cacheLease,
                    ).catch(() => undefined);
                    Logger.warn('Failed to retain dbt git checkout cache', {
                        error,
                    });
                }
                this.cacheLease = undefined;
            } else {
                await this.removeTemporaryRepositoryDirectory(
                    this.localRepositoryDir,
                ).catch(() => undefined);
            }
            await Promise.all(
                [...this.temporaryRepositoryDirectories].map((directory) =>
                    this.removeTemporaryRepositoryDirectory(directory).catch(
                        () => undefined,
                    ),
                ),
            );
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
