import { existsSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const defaultHome = path.join(os.homedir(), '.ldenv');
export const home = process.env.LDENV_HOME ?? defaultHome;

export function canonicalHome(directory: string): string {
    if (!path.isAbsolute(directory))
        throw new Error('LDENV_HOME must be an absolute directory');
    let existing = path.resolve(directory);
    const missing: string[] = [];
    while (!existsSync(existing)) {
        missing.unshift(path.basename(existing));
        existing = path.dirname(existing);
    }
    return path.join(realpathSync(existing), ...missing);
}

export function namespaceForHome(directory: string): string {
    if (path.resolve(directory) === path.resolve(defaultHome)) return '';
    const canonical = canonicalHome(directory);
    if (canonical === path.resolve(defaultHome)) return '';
    const basename = path.basename(canonical);
    const source = basename.replace(/^\.ldenv-?/i, '');
    const namespace = source
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!namespace || namespace.length > 32)
        throw new Error(
            'LDENV_HOME must have a namespace basename of 1-32 letters, digits or separators',
        );
    return namespace;
}

export function resourceNames(directory: string) {
    const value = namespaceForHome(directory);
    return {
        namespace: value,
        postgresContainer: value ? `ldenv-pg-${value}` : 'ldenv-pg',
        postgresVolume: value ? `ldenv_pg_data_${value}` : 'ldenv_pg_data',
        pm2Prefix: value ? `${value}-` : '',
        processName: (id: string, suffix: string) =>
            `${value ? `${value}-` : ''}${id}-${suffix}`,
        parentDatabase: (sha: string) =>
            value
                ? `ldp_${value}_${sha.slice(0, 12)}`
                : `ldp_${sha.slice(0, 12)}`,
        warehouseDatabase: (hash: string) =>
            value
                ? `ldj_${value}_${hash.slice(0, 12)}`
                : `ldj_${hash.slice(0, 12)}`,
        instanceDatabase: (id: string) =>
            value ? `ld_${value}_${id}` : `ld_${id}`,
    };
}

const resources = resourceNames(home);
export const namespace = resources.namespace;
export const postgresContainer = resources.postgresContainer;
export const postgresVolume = resources.postgresVolume;
export const pm2Prefix = resources.pm2Prefix;
export const processName = resources.processName;
export const parentDatabase = resources.parentDatabase;
export const warehouseDatabase = resources.warehouseDatabase;
export const instanceDatabase = resources.instanceDatabase;

export const matchesHomeLabel = (
    label: string | undefined,
    directory = home,
): boolean =>
    !namespaceForHome(directory) || label === canonicalHome(directory);

export function postgresPort(
    value = process.env.LDENV_PG_PORT,
    selectedNamespace = namespace,
    savedPort?: number,
): number {
    if (selectedNamespace && value === undefined)
        throw new Error(
            'LDENV_PG_PORT is required for a non-default LDENV_HOME',
        );
    const port = Number(value ?? 15432);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw new Error('Invalid LDENV_PG_PORT');
    if (savedPort === undefined) return port;
    if (
        !Number.isInteger(savedPort) ||
        savedPort < 1024 ||
        savedPort > 65535 ||
        (value !== undefined && savedPort !== port)
    )
        throw new Error('Invalid LDENV_PG_PORT');
    return savedPort;
}
