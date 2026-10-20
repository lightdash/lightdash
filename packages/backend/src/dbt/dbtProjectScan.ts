import fs from 'fs/promises';
import yaml from 'js-yaml';
import path from 'path';
import Logger from '../logging/logger';

export type DbtProjectScan = {
    projectName: string | null;
    referencesOwnProject?: boolean;
    referencedProjects: string[];
    declaredUpstreams: string[];
    installedPackages: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const readYaml = async (filename: string): Promise<unknown> => {
    try {
        return yaml.load(await fs.readFile(filename, 'utf8'));
    } catch (error) {
        Logger.debug('dbt.compile.projectScanReadFailed', { filename, error });
        return null;
    }
};

export const scanDbtProject = async (
    projectDir: string,
): Promise<DbtProjectScan> => {
    const project = await readYaml(path.join(projectDir, 'dbt_project.yml'));
    const projectName =
        isRecord(project) && typeof project.name === 'string'
            ? project.name
            : null;
    const packagesPath = path.resolve(
        projectDir,
        isRecord(project) &&
            typeof project['packages-install-path'] === 'string'
            ? project['packages-install-path']
            : 'dbt_packages',
    );
    const dependencies = await readYaml(
        path.join(projectDir, 'dependencies.yml'),
    );
    const declaredUpstreams =
        isRecord(dependencies) && Array.isArray(dependencies.projects)
            ? [
                  ...new Set(
                      dependencies.projects.flatMap((entry: unknown) =>
                          isRecord(entry) && typeof entry.name === 'string'
                              ? [entry.name]
                              : [],
                      ),
                  ),
              ]
            : [];
    const walk = async (directory: string): Promise<string[]> => {
        try {
            const entries = await fs.readdir(directory, {
                withFileTypes: true,
            });
            const matches = await Promise.all(
                entries.map(async (entry): Promise<string[]> => {
                    const filename = path.join(directory, entry.name);
                    if (
                        entry.isDirectory() &&
                        path.resolve(filename) !== packagesPath &&
                        !['target', 'dbt_packages', 'logs', '.git'].includes(
                            entry.name,
                        )
                    )
                        return walk(filename);
                    if (entry.isFile() && /\.(sql|ya?ml)$/.test(entry.name)) {
                        try {
                            if (
                                (await fs.stat(filename)).size <=
                                2 * 1024 * 1024
                            ) {
                                const content = await fs.readFile(
                                    filename,
                                    'utf8',
                                );
                                const refs =
                                    /\bref\(\s*(?:['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]|['"]([^'"]+)['"]\s*,\s*package\s*=\s*['"]([^'"]+)['"])/g;
                                return [...content.matchAll(refs)].map(
                                    (match) => match[1] ?? match[4],
                                );
                            }
                        } catch (error) {
                            Logger.debug('dbt.compile.projectScanReadFailed', {
                                filename,
                                error,
                            });
                        }
                    }
                    return [];
                }),
            );
            return matches.flat();
        } catch (error) {
            Logger.debug('dbt.compile.projectScanReadFailed', {
                directory,
                error,
            });
            return [];
        }
    };
    const packageDirectories = await fs
        .readdir(packagesPath, { withFileTypes: true })
        .catch(() => []);
    const installedPackages = [
        ...new Set(
            (
                await Promise.all(
                    packageDirectories
                        .filter(
                            (entry) =>
                                entry.isDirectory() || entry.isSymbolicLink(),
                        )
                        .map(async (entry) => {
                            const installed = await readYaml(
                                path.join(
                                    packagesPath,
                                    entry.name,
                                    'dbt_project.yml',
                                ),
                            );
                            return isRecord(installed) &&
                                typeof installed.name === 'string'
                                ? [installed.name]
                                : [];
                        }),
                )
            ).flat(),
        ),
    ];
    const references = [...new Set(await walk(projectDir))];
    return {
        projectName,
        referencedProjects: references.filter((name) => name !== projectName),
        declaredUpstreams,
        installedPackages,
        ...(projectName !== null && references.includes(projectName)
            ? { referencesOwnProject: true }
            : {}),
    };
};
