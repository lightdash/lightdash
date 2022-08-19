import {
    DbtError,
    DbtPackages,
    DbtRpcDocsGenerateResults,
    DbtRpcGetManifestResults,
    isDbtPackages,
    isDbtRpcDocsGenerateResults,
    isDbtRpcManifestResults,
    ParseError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import execa from 'execa';
import * as fs from 'fs/promises';
import yaml, { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import path from 'path';
import Logger from '../logger';
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
    } catch (e: any) {
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

    private async _runDbtCommand(
        ...command: string[]
    ): Promise<string | undefined> {
        const dbtArgs = [
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
            const dbtProcess = await execa('dbt', dbtArgs, {
                all: true,
                stdio: ['pipe', 'pipe', process.stderr],
                env: {
                    ...this.environment,
                },
            });
            return dbtProcess.all;
        } catch (e: any) {
            throw new DbtError(
                `Failed to run "dbt ${command.join(' ')}"\n${e.all}`,
                {
                    logs: e.all,
                },
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
        });
        const dbtLogs = await this._runDbtCommand('compile');
        const rawManifest = {
            manifest: await this.loadDbtTargetArtifact('manifest.json'),
        };
        span?.finish();
        if (isDbtRpcManifestResults(rawManifest)) {
            return rawManifest;
        }
        throw new DbtError(
            'Cannot read response from dbt, manifest.json not valid',
            { logs: dbtLogs },
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
        } catch (e: any) {
            throw new DbtError(
                `Cannot read response from dbt, could not read dbt artifact: ${fullPath}`,
                {},
            );
        }
    }

    async getDbtCatalog(): Promise<DbtRpcDocsGenerateResults> {
        const transaction = Sentry.getCurrentHub()
            ?.getScope()
            ?.getTransaction();
        const span = transaction?.startChild({
            op: 'dbt',
            description: 'getDbtbCatalog',
        });
        const dbtLogs = await this._runDbtCommand('docs', 'generate');
        const rawCatalog = await this.loadDbtTargetArtifact('catalog.json');
        span?.finish();
        if (isDbtRpcDocsGenerateResults(rawCatalog)) {
            return rawCatalog;
        }
        throw new DbtError(
            'Cannot read response from dbt, catalog.json is not a valid dbt catalog',
            { dbtLogs },
        );
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
