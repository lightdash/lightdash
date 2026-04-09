import { SupportedDbtVersions } from '@lightdash/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import Logger from '../logging/logger';
import { getDbtExecName } from './dbtCliClient';

/**
 * Find the venv path for a dbt executable by searching PATH and resolving symlinks.
 * e.g. dbt1.11 → /usr/local/bin/dbt1.11 → /usr/local/dbt1.11/bin/dbt → venv: /usr/local/dbt1.11
 */
async function findVenvPath(exec: string): Promise<string | null> {
    const pathDirs = (process.env.PATH || '').split(':');
    const results = await Promise.all(
        pathDirs.map(async (dir) => {
            try {
                const realPath = await fs.realpath(path.join(dir, exec));
                // realPath is like /usr/local/dbt1.11/bin/dbt — venv is two levels up
                return path.dirname(path.dirname(realPath));
            } catch {
                return null;
            }
        }),
    );
    return results.find((r) => r !== null) ?? null;
}

/**
 * Read the dbt-core version from a venv's installed package metadata.
 * Looks for a dbt_core-<version>.dist-info directory in site-packages.
 */
async function readDbtCoreVersion(venvPath: string): Promise<string | null> {
    try {
        const libDir = path.join(venvPath, 'lib');
        const pythonDirs = await fs.readdir(libDir);
        const pythonDir = pythonDirs.find((d) => d.startsWith('python3'));
        if (!pythonDir) return null;

        const sitePackages = path.join(libDir, pythonDir, 'site-packages');
        const entries = await fs.readdir(sitePackages);
        // pip 21.3+ normalizes to dbt_core-, older pip uses dbt-core-
        const distInfo = entries.find(
            (e) =>
                (e.startsWith('dbt_core-') || e.startsWith('dbt-core-')) &&
                e.endsWith('.dist-info'),
        );
        if (!distInfo) return null;

        const match = distInfo.match(/^dbt[_-]core-([\d.]+)\.dist-info$/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

async function detectDbtPatchVersion(
    version: SupportedDbtVersions,
): Promise<string | null> {
    const exec = getDbtExecName(version);
    const venvPath = await findVenvPath(exec);
    if (!venvPath) return null;
    return readDbtCoreVersion(venvPath);
}

// Cached for process lifetime — dbt versions are fixed in the Docker image
let cachedPromise: Promise<
    Partial<Record<SupportedDbtVersions, string>>
> | null = null;

export async function getInstalledDbtVersions(): Promise<
    Partial<Record<SupportedDbtVersions, string>>
> {
    if (!cachedPromise) {
        cachedPromise = (async () => {
            const versions = Object.values(SupportedDbtVersions);
            const results = await Promise.all(
                versions.map(async (version) => {
                    const patchVersion = await detectDbtPatchVersion(version);
                    return [version, patchVersion] as const;
                }),
            );

            const installed: Partial<Record<SupportedDbtVersions, string>> = {};
            for (const [version, patchVersion] of results) {
                if (patchVersion) {
                    installed[version] = patchVersion;
                }
            }

            Logger.debug(
                `Detected installed dbt versions: ${JSON.stringify(installed)}`,
            );
            return installed;
        })();
    }
    return cachedPromise;
}
