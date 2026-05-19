import {
    AnyType,
    assertUnreachable,
    DbtError,
    DbtLog,
    DbtPackages,
    DbtRpcGetManifestResults,
    getErrorMessage,
    isDbtLog,
    isDbtPackages,
    isDbtRpcManifestResults,
    ParseError,
    SupportedDbtVersions,
    validateDbtSelector,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import execa, { ExecaError, ExecaReturnValue } from 'execa';
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

const isRawDbtConfig = (raw: AnyType): raw is RawDbtProjectConfig =>
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
            `dbt_project.yml was not found or isn't a valid yaml document: ${getErrorMessage(
                e,
            )}`,
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
    selector?: string;
};

enum DbtCommands {
    DBT_1_4 = 'dbt',
    DBT_1_5 = 'dbt1.5',
    DBT_1_6 = 'dbt1.6',
    DBT_1_7 = 'dbt1.7',
    DBT_1_8 = 'dbt1.8',
    DBT_1_9 = 'dbt1.9',
    DBT_1_10 = 'dbt1.10',
    DBT_1_11 = 'dbt1.11',
}

export function getDbtExecName(version: SupportedDbtVersions): string {
    switch (version) {
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
        case SupportedDbtVersions.V1_9:
            return DbtCommands.DBT_1_9;
        case SupportedDbtVersions.V1_10:
            return DbtCommands.DBT_1_10;
        case SupportedDbtVersions.V1_11:
            return DbtCommands.DBT_1_11;
        default:
            return assertUnreachable(
                version,
                'Missing dbt version command mapping',
            );
    }
}

export class DbtCliClient implements DbtClient {
    dbtProjectDirectory: string;

    dbtProfilesDirectory: string;

    environment: Record<string, string>;

    profileName: string | undefined;

    target: string | undefined;

    targetDirectory: string | undefined;

    dbtVersion: SupportedDbtVersions;

    selector?: string;

    constructor({
        dbtProjectDirectory,
        dbtProfilesDirectory,
        environment,
        profileName,
        target,
        dbtVersion,
        selector,
    }: DbtCliArgs) {
        this.dbtProjectDirectory = dbtProjectDirectory;
        this.dbtProfilesDirectory = dbtProfilesDirectory;
        this.environment = environment;
        this.profileName = profileName;
        this.target = target;
        this.targetDirectory = undefined;
        this.dbtVersion = dbtVersion;
        this.selector = selector;
    }

    getSelector(): string | undefined {
        return this.selector;
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
        return getDbtExecName(this.dbtVersion);
    }

    private async _runDbtCommand(...command: string[]): Promise<{
        logs: DbtLog[];
        stdout: string;
    }> {
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
                    DBT_PARTIAL_PARSE: 'false', // Disable dbt from storing manifest and doing partial parses. https://docs.getdbt.com/reference/parsing#partial-parsing
                    DBT_SEND_ANONYMOUS_USAGE_STATS: 'false', // Disable sending usage stats. https://docs.getdbt.com/reference/global-configs/usage-stats
                    ...this.environment,
                },
            });
            return {
                logs: DbtCliClient.parseDbtJsonLogs(dbtProcess.all),
                stdout: dbtProcess.stdout,
            };
        } catch (e) {
            Logger.error(
                `Error running dbt command with version ${
                    this.dbtVersion
                }: ${getErrorMessage(e)}`,
            );
            // TODO parse ExecaError
            const execaError = e as Partial<ExecaError>;
            if (
                execaError &&
                'all' in execaError &&
                typeof execaError.all === 'string'
            ) {
                throw new DbtError(
                    `Failed to run "${dbtExec} ${command.join(
                        ' ',
                    )}" with dbt version "${this.dbtVersion}"`,
                    DbtCliClient.parseDbtJsonLogs(execaError.all),
                );
            }
            throw e;
        }
    }

    async installDeps(): Promise<void> {
        return Sentry.startSpan(
            {
                op: 'dbt',
                name: 'installDeps',
            },
            async () => {
                const startTime = Date.now();
                await this._runDbtCommand('deps');
                Logger.info(
                    `dbt deps completed in ${Date.now() - startTime}ms`,
                );
            },
        );
    }

    static validateSelector(selector: string): boolean {
        return validateDbtSelector(selector);
    }

    /**
     * Parse model unique IDs from `dbt ls --output json --output-keys unique_id` stdout.
     *
     * With --output json --output-keys unique_id, we get canonical unique_ids
     * (e.g. model.project.my_model) across all dbt versions. The format differs:
     *
     * - dbt 1.4: bare JSON on stdout: {"unique_id": "model.project.my_model"}
     * - dbt 1.5-1.8: JSON log envelope with info.code "Z049", data.msg is a
     *   JSON string: '{"unique_id": "model.project.my_model"}'
     * - dbt 1.9-1.10: same as above but info.code is "Z052"
     */
    static parseModelIdsFromStdout(stdout: string): string[] {
        const modelIds: string[] = [];

        stdout
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .forEach((line) => {
                let parsed;
                try {
                    parsed = JSON.parse(line.trim());
                } catch {
                    return;
                }

                // dbt 1.5+: ls output is nested JSON inside the log envelope
                const code = parsed?.info?.code;
                if (code === 'Z049' || code === 'Z052') {
                    try {
                        const inner = JSON.parse(parsed.data.msg);
                        if (
                            typeof inner.unique_id === 'string' &&
                            inner.unique_id.startsWith('model.')
                        ) {
                            modelIds.push(inner.unique_id);
                        }
                    } catch {
                        // skip malformed inner JSON
                    }
                } else if (
                    // dbt 1.4: bare JSON with unique_id directly
                    typeof parsed.unique_id === 'string' &&
                    parsed.unique_id.startsWith('model.')
                ) {
                    modelIds.push(parsed.unique_id);
                }
            });

        return modelIds;
    }

    async getDbtManifest(): Promise<DbtRpcGetManifestResults> {
        return Sentry.startSpan(
            {
                op: 'dbt',
                name: 'getDbtManifest',
            },
            async () => {
                const dbtCommand: string[] = [
                    'ls',
                    '--output',
                    'json',
                    '--output-keys',
                    'unique_id',
                ];
                const selector = this.selector?.trim();

                if (selector) {
                    if (!DbtCliClient.validateSelector(selector)) {
                        throw new ParseError('Invalid dbt selector format');
                    }
                    dbtCommand.push('--select', selector);
                }
                const startTime = Date.now();
                const { logs, stdout } = await this._runDbtCommand(
                    ...dbtCommand,
                );
                const elapsed = Date.now() - startTime;
                const selectedModelIds =
                    DbtCliClient.parseModelIdsFromStdout(stdout);
                Logger.info(
                    `dbt ls completed in ${elapsed}ms, found ${selectedModelIds.length} model(s)`,
                );
                const rawManifest = {
                    manifest: await this.loadDbtTargetArtifact('manifest.json'),
                };
                if (isDbtRpcManifestResults(rawManifest)) {
                    return {
                        ...rawManifest,
                        ...(selector ? { selectedModelIds } : {}),
                    };
                }
                throw new DbtError(
                    'Cannot read response from dbt, manifest.json not valid',
                    logs,
                );
            },
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

    private async loadDbtTargetArtifact(filename: string): Promise<AnyType> {
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
    ): Promise<AnyType> {
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

    private async ensureDbtProjectDir(): Promise<void> {
        try {
            await fs.access(this.dbtProjectDirectory);
        } catch (e) {
            throw new DbtError(
                `dbt project directory not found: /${path.basename(
                    this.dbtProjectDirectory,
                )}`,
            );
        }
    }

    async test(): Promise<void> {
        return Sentry.startSpan(
            {
                op: 'dbt',
                name: 'test',
            },
            async () => {
                await this.ensureDbtProjectDir();
                await this.installDeps();
                await this._runDbtCommand('parse');
            },
        );
    }
}
