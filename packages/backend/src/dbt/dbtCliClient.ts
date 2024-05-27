import {
    assertUnreachable,
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
    dbtVersion: SupportedDbtVersions;
    useDbtLs?: boolean;
};

enum DbtCommands {
    DBT_1_4 = 'dbt',
    DBT_1_5 = 'dbt1.5',
    DBT_1_6 = 'dbt1.6',
    DBT_1_7 = 'dbt1.7',
    DBT_1_8 = 'dbt1.8',
}

export class DbtCliClient implements DbtClient {
    dbtProjectDirectory: string;

    dbtProfilesDirectory: string;

    environment: Record<string, string>;

    profileName: string | undefined;

    target: string | undefined;

    targetDirectory: string | undefined;

    dbtVersion: SupportedDbtVersions;

    useDbtLs: boolean;

    constructor({
        dbtProjectDirectory,
        dbtProfilesDirectory,
        environment,
        profileName,
        target,
        dbtVersion,
        useDbtLs,
    }: DbtCliArgs) {
        this.dbtProjectDirectory = dbtProjectDirectory;
        this.dbtProfilesDirectory = dbtProfilesDirectory;
        this.environment = environment;
        this.profileName = profileName;
        this.target = target;
        this.targetDirectory = undefined;
        this.dbtVersion = dbtVersion;
        this.useDbtLs = useDbtLs ?? false;
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

    getDbtExec(): string {
        switch (this.dbtVersion) {
            case SupportedDbtVersions.V1_4:
                return DbtCommands.DBT_1_4;
            case SupportedDbtVersions.V1_5:
                return DbtCommands.DBT_1_5;
            case SupportedDbtVersions.V1_6:
                return DbtCommands.DBT_1_6;
            case SupportedDbtVersions.V1_7:
                return DbtCommands.DBT_1_7;
            case SupportedDbtVersions.V1_8:
                return DbtCommands.DBT_1_8;
            default:
                return assertUnreachable(
                    this.dbtVersion,
                    'Missing dbt version command mapping',
                );
        }
    }

    private async _runDbtCommand(...command: string[]): Promise<DbtLog[]> {
        const dbtExec = this.getDbtExec();
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
            Logger.debug(
                `Running dbt command with version "${
                    this.dbtVersion
                }": ${dbtExec} ${dbtArgs.join(' ')}`,
            );
            const dbtProcess = await execa(dbtExec, dbtArgs, {
                all: true,
                stdio: ['pipe', 'pipe', process.stderr],
                env: {
                    ...this.environment,
                },
            });
            return DbtCliClient.parseDbtJsonLogs(dbtProcess.all);
        } catch (e) {
            Logger.error(
                `Error running dbt command with version ${this.dbtVersion}: ${e}`,
            );

            throw new DbtError(
                `Failed to run "${dbtExec} ${command.join(
                    ' ',
                )}" with dbt version "${this.dbtVersion}"`,
                DbtCliClient.parseDbtJsonLogs(e.all),
            );
        }
    }

    async installDeps(): Promise<void> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'dbt',
            description: 'installDeps',
        });
        await this._runDbtCommand('deps');
        span?.finish();
    }

    async getDbtManifest(): Promise<DbtRpcGetManifestResults> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'dbt',
            description: 'getDbtManifest',
            data: {
                useDbtLs: this.useDbtLs,
            },
        });
        const logs = await this._runDbtCommand(
            this.useDbtLs ? 'ls' : 'compile',
        );
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

    async test(): Promise<void> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'dbt',
            description: 'test',
        });
        await this.installDeps();
        await this._runDbtCommand('parse');
        span?.finish();
    }
}
