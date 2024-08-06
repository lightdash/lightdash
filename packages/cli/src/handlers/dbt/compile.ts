import { ParseError } from '@lightdash/common';
import execa from 'execa';
import GlobalState from '../../globalState';
import { getDbtVersion } from './getDbtVersion';

export type DbtCompileOptions = {
    profilesDir: string;
    projectDir: string;
    target: string | undefined;
    profile: string | undefined;
    select: string[] | undefined;
    models: string[] | undefined;
    vars: string | undefined;
    threads: string | undefined;
    noVersionCheck: boolean | undefined;
    exclude: string[] | undefined;
    selector: string | undefined;
    state: string | undefined;
    fullRefresh: boolean | undefined;
    skipDbtCompile: boolean | undefined;
    skipWarehouseCatalog: boolean | undefined;
    useDbtList: boolean | undefined;
};

const dbtCompileArgs = [
    'profilesDir',
    'projectDir',
    'target',
    'profile',
    'select',
    'models',
    'vars',
    'threads',
    'noVersionCheck',
    'exclude',
    'selector',
    'state',
    'fullRefresh',
];

const camelToSnakeCase = (str: string) =>
    str.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const optionsToArgs = (options: DbtCompileOptions): string[] =>
    Object.entries(options).reduce<string[]>((acc, [key, value]) => {
        if (value !== undefined && dbtCompileArgs.includes(key)) {
            const argKey = `--${camelToSnakeCase(key)}`;
            if (typeof value !== 'boolean') {
                return [
                    ...acc,
                    argKey,
                    Array.isArray(value) ? value.join(' ') : value,
                ];
            }
            return [...acc, argKey];
        }
        return acc;
    }, []);
export const dbtCompile = async (options: DbtCompileOptions) => {
    try {
        const args = optionsToArgs(options);
        GlobalState.debug(`> Running: dbt compile ${args.join(' ')}`);
        const { stdout, stderr } = await execa('dbt', ['compile', ...args]);
        console.error(stdout);
        console.error(stderr);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '-';
        throw new ParseError(`Failed to run dbt compile:\n  ${msg}`);
    }
};

export const dbtList = async (
    options: DbtCompileOptions,
): Promise<string[]> => {
    try {
        const args = [
            ...optionsToArgs(options),
            '--output',
            'json',
            '--output-keys',
            'unique_id',
        ];
        const version = await getDbtVersion();
        // older dbt versions don't support --quiet flag
        if (!version.startsWith('1.3.') && !version.startsWith('1.4.')) {
            args.push('--quiet');
        }
        GlobalState.debug(`> Running: dbt ls ${args.join(' ')}`);
        const { stdout, stderr } = await execa('dbt', ['ls', ...args]);
        const models = stdout
            .split('\n')
            .map<string>((line) => {
                try {
                    return JSON.parse(line).unique_id;
                } catch {
                    // ignore non-json lines
                    return '';
                }
            })
            .filter((modelId) => modelId.startsWith('model.')); // filter models by name because "--models" and "--resource_type" are mutually exclusive arguments
        GlobalState.debug(`> Models: ${models.join(' ')}`);
        console.error(stderr);
        return models;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '-';
        throw new ParseError(
            `Error executing 'dbt ls':\n  ${msg}\nEnsure you're on the latest patch version. '--use-dbt-list' is true by default; if you encounter issues, try using '--use-dbt-list=false`,
        );
    }
};
