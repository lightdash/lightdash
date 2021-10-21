import execa from 'execa';
import { load as loadYaml } from 'js-yaml';
import * as fs from 'fs/promises';
import path from 'path';
import {
    DbtRpcDocsGenerateResults,
    DbtRpcGetManifestResults,
    isDbtRpcDocsGenerateResults,
    isDbtRpcManifestResults,
} from 'common';
import { DbtError, ParseError } from '../errors';
import { DbtClient } from '../types';

type DbtProjectConfig = {
    targetDir: string;
};

type RawDbtProjectConfig = {
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
    return {
        targetDir: config['target-dir'] || '/target',
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
            const dbtProcess = await execa('dbt', dbtArgs, {
                all: true,
                stdio: ['pipe', 'pipe', process.stderr],
                env: {
                    ...process.env,
                    ...this.environment,
                },
            });
            return dbtProcess.all;
        } catch (e) {
            throw new DbtError(
                `Failed to run "dbt ${command.join(' ')}"\n${e.all}`,
                {
                    logs: e.all,
                },
            );
        }
    }

    async installDeps(): Promise<void> {
        await this._runDbtCommand('deps');
    }

    async getDbtManifest(): Promise<DbtRpcGetManifestResults> {
        const dbtLogs = await this._runDbtCommand('compile');
        const rawManifest = {
            manifest: await this._loadDbtArtifact('manifest.json'),
        };
        if (isDbtRpcManifestResults(rawManifest)) {
            return rawManifest;
        }
        throw new DbtError(
            'Cannot read response from dbt, manifest.json not valid',
            { logs: dbtLogs },
        );
    }

    private async _loadDbtArtifact(filename: string): Promise<any> {
        const targetDir = await this._getTargetDirectory();
        const fullPath = path.join(
            this.dbtProjectDirectory,
            targetDir,
            filename,
        );
        try {
            return JSON.parse(await fs.readFile(fullPath, 'utf-8'));
        } catch (e) {
            throw new DbtError(
                `Cannot read response from dbt, could not read dbt artifact: ${filename}`,
                {},
            );
        }
    }

    async getDbtCatalog(): Promise<DbtRpcDocsGenerateResults> {
        const dbtLogs = await this._runDbtCommand('docs', 'generate');
        const rawCatalog = await this._loadDbtArtifact('catalog.json');
        if (isDbtRpcDocsGenerateResults(rawCatalog)) {
            return rawCatalog;
        }
        throw new DbtError(
            'Cannot read response from dbt, catalog.json is not a valid dbt catalog',
            { dbtLogs },
        );
    }

    async test(): Promise<void> {
        await this._runDbtCommand('debug');
    }
}
