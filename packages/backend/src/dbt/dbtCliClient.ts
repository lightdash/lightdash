import {
    DbtError,
    DbtLog,
    DbtManifestVersion,
    DbtPackages,
    DbtRpcDocsGenerateResults,
    DbtRpcGetManifestResults,
    DefaultSupportedDbtVersion,
    isDbtLog,
    isDbtPackages,
    isDbtRpcDocsGenerateResults,
    isDbtRpcManifestResults,
    ParseError,
    SupportedDbtVersions,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import execa from 'execa';
import * as fs from 'fs/promises';
import yaml, { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import path from 'path';
import Logger from '../logging/logger';
import { DbtClient } from '../types';

type DbtProjectConfig = {
    targetDir: string;
};

type RawDbtProjectConfig = {
    'target-path'?: string;
    'target-dir'?: string;
};

const isRawDbtConfig = (raw: any): raw is RawDbtProjectConfig =>
    typeof raw === 'object' &&
    raw !== null &&
    (raw['target-dir'] === undefined || typeof raw['target-dir'] === 'string');

export const getDbtConfig = async (
    dbtProjectDirectory: string,
): Promise<DbtProjectConfig> => {
    let config;
    const configPath = path.join(dbtProjectDirectory, 'dbt_project.yml');
    try {
        config = loadYaml(await fs.readFile(configPath, 'utf-8'));
    } catch (e) {
        throw new ParseError(
            `dbt_project.yml was not found or isn't a valid yaml document: ${e.message}`,
            {},
        );
    }
    if (!isRawDbtConfig(config)) {
        throw new Error('dbt_project.yml not valid');
    }
    const updatedConfig = {
        ...config,
        'target-path': 'target',
    };
    await fs.writeFile(configPath, dumpYaml(updatedConfig), 'utf-8');
    return {
        targetDir: '/target',
    };
};

type DbtCliArgs = {
    dbtProjectDirectory: string;
    dbtProfilesDirectory: string;
    environment: Record<string, string>;
    profileName?: string;
    target?: string;
};

enum DbtCommands {
    DBT_1_4 = 'dbt',
    DBT_1_5 = 'dbt1.5',
}

export class DbtCliClient implements DbtClient {
    dbtProjectDirectory: string;

    dbtProfilesDirectory: string;

    environment: Record<string, string>;

    profileName: string | undefined;

    target: string | undefined;

    targetDirectory: string | undefined;

    constructor({
        dbtProjectDirectory,
        dbtProfilesDirectory,
        environment,
        profileName,
        target,
    }: DbtCliArgs) {
        this.dbtProjectDirectory = dbtProjectDirectory;
        this.dbtProfilesDirectory = dbtProfilesDirectory;
        this.environment = environment;
        this.profileName = profileName;
        this.target = target;
        this.targetDirectory = undefined;
    }

    private async _getTargetDirectory(): Promise<string> {
        if (!this.targetDirectory) {
            const config = await getDbtConfig(this.dbtProjectDirectory);
            this.targetDirectory = config.targetDir;
        }
        return this.targetDirectory;
    }

    static parseDbtJsonLogs(logs: string | undefined): DbtLog[] {
        const lines = logs?.split('\n');
        return (lines || []).reduce<DbtLog[]>((acc, line) => {
            try {
                const log = JSON.parse(line);
                if (isDbtLog(log)) {
                    return [...acc, log];
                }
                return acc;
            } catch (e) {
                Logger.warn('Error parsing dbt json log', e);
            }
            return acc;
        }, []);
    }
    /*
    private async _runDbtVersionCommand(
        ...command: string[]
    ): Promise<{ version: DbtManifestVersion; logs: DbtLog[] }> {
        const dbtExecs = Object.values(DbtCommands);
        const errorLogs: Partial<Record<DbtCommands, DbtLog[]>> = {};

        // eslint-disable-next-line no-restricted-syntax
        for await (const dbtExec of dbtExecs) {
            Logger.info(
                `Running dbt exec "${dbtExec}" with command "${command.join(
                    ' ',
                )}"`,
            );

            try {
                return {
                    version:
                        dbtExec === 'dbt1.5'
                            ? DbtManifestVersion.V9
                            : DbtManifestVersion.V8,
                    logs: await this._runDbtCommand(dbtExec, ...command),
                };
            } catch (e: unknown) {
                Sentry.captureException(e, { extra: { dbtExec } });
                Logger.warn(
                    `Error running ${dbtExec} command "${command.join(
                        ' ',
                    )}": ${e}`,
                );

                if (!(e instanceof DbtError)) throw e;
                errorLogs[dbtExec] = e.logs || [];
                if (dbtExecs[dbtExecs.length - 1] === dbtExec) {
                    throw new DbtError(
                        `We failed to run "dbt ${command.join(
                            ' ',
                        )}" successfully across all versions of dbt that Lightdash currently supports. You can see specific errors below for each dbt version we tried to use.`,
                        Object.entries(errorLogs).reduce<DbtLog[]>(
                            (acc, [key, logs]) => {
                                const versionLog: DbtLog = {
                                    code: '',
                                    info: {
                                        category: '',
                                        code: '',
                                        extra: {},
                                        invocation_id: '',
                                        level: 'error',
                                        log_version: 2,
                                        msg: `[dbt ${
                                            DbtCommandVersion[
                                                key as DbtCommands
                                            ]
                                        }]`,
                                        name: '',
                                        pid: 0,
                                        thread_name: '',
                                        ts: '',
                                        type: 'log_line',
                                    },
                                };
                                return [...acc, versionLog, ...logs];
                            },
                            [],
                        ),
                    );
                }
            }
        }
        return { version: DbtManifestVersion.V8, logs: [] };
    } */

    private static getDbtExec(dbtVersion: SupportedDbtVersions): string {
        switch (dbtVersion) {
            case SupportedDbtVersions.V1_4:
                return DbtCommands.DBT_1_4;
            case SupportedDbtVersions.V1_5:
                return DbtCommands.DBT_1_5;
            default: // undefined
                return DefaultSupportedDbtVersion;
        }
    }

    private async _runDbtCommand(
        dbtVersion: SupportedDbtVersions,
        ...command: string[]
    ): Promise<DbtLog[]> {
        const dbtExec = DbtCliClient.getDbtExec(dbtVersion);
        const dbtArgs = [
            '--no-use-colors',
            '--log-format',
            'json',
            ...command,
            '--profiles-dir',
            this.dbtProfilesDirectory,
            '--project-dir',
            this.dbtProjectDirectory,
        ];
        if (this.target) {
            dbtArgs.push('--target', this.target);
        }
        if (this.profileName) {
            dbtArgs.push('--profile', this.profileName);
        }
        try {
            Logger.debug(`Running dbt command: dbt ${dbtArgs.join(' ')}`);
            const dbtProcess = await execa(dbtExec, dbtArgs, {
                all: true,
                stdio: ['pipe', 'pipe', process.stderr],
                env: {
                    ...this.environment,
                },
            });
            return DbtCliClient.parseDbtJsonLogs(dbtProcess.all);
        } catch (e) {
            Logger.error(`Error running dbt command  ${e}`);

            throw new DbtError(
                `Failed to run "dbt ${command.join(
                    ' ',
                )}" with dbt version "${dbtVersion}}"`,
                DbtCliClient.parseDbtJsonLogs(e.all),
            );
        }
    }

    async installDeps(dbtVersion: SupportedDbtVersions): Promise<void> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'dbt',
            description: 'installDeps',
        });
        await this._runDbtCommand(dbtVersion, 'deps');
        span?.finish();
    }

    async getDbtManifest(
        dbtVersion: SupportedDbtVersions,
    ): Promise<DbtRpcGetManifestResults> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'dbt',
            description: 'getDbtManifest',
        });
        const logs = await this._runDbtCommand(dbtVersion, 'compile');
        const rawManifest = {
            manifest: await this.loadDbtTargetArtifact('manifest.json'),
        };
        span?.finish();
        if (isDbtRpcManifestResults(rawManifest)) {
            return rawManifest;
        }
        throw new DbtError(
            'Cannot read response from dbt, manifest.json not valid',
            logs,
        );
    }

    async getDbtPackages(): Promise<DbtPackages | undefined> {
        const packagesPath = path.join(
            this.dbtProjectDirectory,
            'packages.yml',
        );
        let packages;
        try {
            packages = await DbtCliClient.loadDbtFile(packagesPath, 'YML');
            if (isDbtPackages(packages)) {
                return packages;
            }
            return undefined;
        } catch {
            // ignore error if file not available
            return undefined;
        }
    }

    private async loadDbtTargetArtifact(filename: string): Promise<any> {
        const targetDir = await this._getTargetDirectory();

        const fullPath = path.join(
            this.dbtProjectDirectory,
            targetDir,
            filename,
        );
        return DbtCliClient.loadDbtFile(fullPath);
    }

    static async loadDbtFile(
        fullPath: string,
        fileType: 'JSON' | 'YML' = 'JSON',
    ): Promise<any> {
        try {
            Logger.debug(`Load dbt artifact: ${fullPath}`);
            const file = await fs.readFile(fullPath, 'utf-8');
            if (fileType === 'JSON') {
                return JSON.parse(file);
            }
            return yaml.load(file);
        } catch (e) {
            throw new DbtError(
                `Cannot read response from dbt, could not read dbt artifact: ${fullPath}`,
            );
        }
    }

    async getDbtCatalog(
        dbtVersion: SupportedDbtVersions,
    ): Promise<DbtRpcDocsGenerateResults> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'dbt',
            description: 'getDbtbCatalog',
        });
        const logs = await this._runDbtCommand(dbtVersion, 'docs', 'generate');
        const rawCatalog = await this.loadDbtTargetArtifact('catalog.json');
        span?.finish();
        if (isDbtRpcDocsGenerateResults(rawCatalog)) {
            return rawCatalog;
        }
        throw new DbtError(
            'Cannot read response from dbt, catalog.json is not a valid dbt catalog',
            logs,
        );
    }

    async test(dbtVersion: SupportedDbtVersions): Promise<void> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'dbt',
            description: 'test',
        });
        await this.installDeps(dbtVersion);
        await this._runDbtCommand(dbtVersion, 'parse');
        span?.finish();
    }
}
