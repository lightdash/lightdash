import fs from 'fs/promises';
import yaml from 'js-yaml';
import path from 'path';
import Logger from '../logging/logger';

export type ScannedDbtRef = {
    packageName: string | null;
    name: string;
    version: string | null;
};

export type DbtProjectScan = {
    refs: ScannedDbtRef[];
    localModels: string[];
    installedPackageModels: string[];
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

const resourceDirectories = (root: string, project: unknown) => {
    const directories = (resource: 'model' | 'seed' | 'snapshot') => {
        const configured = isRecord(project)
            ? project[`${resource}-paths`]
            : null;
        return (
            Array.isArray(configured)
                ? configured.filter(
                      (entry): entry is string => typeof entry === 'string',
                  )
                : [`${resource}s`]
        ).map((directory) => path.resolve(root, directory));
    };
    return {
        models: directories('model'),
        seeds: directories('seed'),
        snapshots: directories('snapshot'),
    };
};

const isWithinDirectories = (filename: string, directories: string[]) =>
    directories.some((root) => {
        const relative = path.relative(root, filename);
        return (
            !relative.startsWith(`..${path.sep}`) &&
            relative !== '..' &&
            !path.isAbsolute(relative)
        );
    });

const normalizeVersion = (version: string | null): string | null =>
    version !== null && /^\d+(?:\.\d+)?$/.test(version)
        ? String(Number(version))
        : version;

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
    const refs = new Map<string, ScannedDbtRef>();
    const localModels = new Set<string>();
    const installedPackageModels = new Set<string>();
    const walk = async (
        directory: string,
        packageModels: Set<string> | null = null,
        resourcePaths = resourceDirectories(projectDir, project),
    ): Promise<void> => {
        try {
            const entries = await fs.readdir(directory, {
                withFileTypes: true,
            });
            await Promise.all(
                entries.map(async (entry) => {
                    const filename = path.join(directory, entry.name);
                    if (
                        entry.isDirectory() &&
                        path.resolve(filename) !== packagesPath &&
                        !['target', 'dbt_packages', 'logs', '.git'].includes(
                            entry.name,
                        )
                    ) {
                        await walk(filename, packageModels, resourcePaths);
                    } else if (
                        entry.isFile() &&
                        /\.(sql|py|csv|ya?ml)$/.test(entry.name)
                    ) {
                        try {
                            const models = packageModels ?? localModels;
                            if (/\.csv$/.test(entry.name)) {
                                if (
                                    isWithinDirectories(
                                        filename,
                                        resourcePaths.seeds,
                                    )
                                )
                                    models.add(
                                        entry.name.replace(/\.csv$/, ''),
                                    );
                                return;
                            }
                            if (
                                (await fs.stat(filename)).size >
                                2 * 1024 * 1024
                            )
                                return;
                            const content = await fs.readFile(filename, 'utf8');
                            if (
                                isWithinDirectories(
                                    filename,
                                    resourcePaths.models,
                                ) &&
                                /\.(sql|py)$/.test(entry.name)
                            )
                                models.add(
                                    entry.name
                                        .replace(/\.(sql|py)$/, '')
                                        .replace(/_v\d+$/, ''),
                                );
                            if (
                                isWithinDirectories(
                                    filename,
                                    resourcePaths.snapshots,
                                ) &&
                                /\.sql$/.test(entry.name)
                            ) {
                                for (const match of content.matchAll(
                                    /{%[-+]?\s*snapshot\s+([A-Za-z_][A-Za-z0-9_]*)\s*[-+]?%}/g,
                                ))
                                    models.add(match[1]);
                            }
                            if (
                                /\.ya?ml$/.test(entry.name) &&
                                isWithinDirectories(filename, [
                                    ...resourcePaths.models,
                                    ...resourcePaths.seeds,
                                    ...resourcePaths.snapshots,
                                ])
                            ) {
                                const schema: unknown =
                                    await readYaml(filename);
                                if (isRecord(schema)) {
                                    ['models', 'seeds', 'snapshots'].forEach(
                                        (resource) => {
                                            const nodes = schema[resource];
                                            if (Array.isArray(nodes))
                                                nodes.forEach(
                                                    (node: unknown) => {
                                                        if (
                                                            isRecord(node) &&
                                                            typeof node.name ===
                                                                'string'
                                                        )
                                                            models.add(
                                                                node.name,
                                                            );
                                                    },
                                                );
                                        },
                                    );
                                }
                            }
                            if (packageModels !== null) return;
                            const calls =
                                /\bref\(\s*(['"])([^'"]+)\1\s*((?:,\s*(?:['"][^'"]+['"]|(?:package|v|version)\s*=\s*(?:['"][^'"]+['"]|[0-9]+(?:\.[0-9]+)?)))*)\s*\)/g;
                            for (const match of content.matchAll(calls)) {
                                const rest = match[3];
                                const second = /^,\s*['"]([^'"]+)['"]/.exec(
                                    rest,
                                );
                                const pkg =
                                    /\bpackage\s*=\s*['"]([^'"]+)['"]/.exec(
                                        rest,
                                    );
                                const version =
                                    /\b(?:v|version)\s*=\s*(?:['"]([^'"]+)['"]|([0-9]+(?:\.[0-9]+)?))/.exec(
                                        rest,
                                    );
                                const ref: ScannedDbtRef = {
                                    packageName: second
                                        ? match[2]
                                        : (pkg?.[1] ?? null),
                                    name: second?.[1] ?? match[2],
                                    version: normalizeVersion(
                                        version?.[1] ?? version?.[2] ?? null,
                                    ),
                                };
                                refs.set(JSON.stringify(ref), ref);
                            }
                        } catch (error) {
                            Logger.debug('dbt.compile.projectScanReadFailed', {
                                filename,
                                error,
                            });
                        }
                    }
                }),
            );
        } catch (error) {
            Logger.debug('dbt.compile.projectScanReadFailed', {
                directory,
                error,
            });
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
                            await walk(
                                path.join(packagesPath, entry.name),
                                installedPackageModels,
                                resourceDirectories(
                                    path.join(packagesPath, entry.name),
                                    installed,
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
    await walk(projectDir);
    const references = [
        ...new Set(
            [...refs.values()].flatMap((ref) =>
                ref.packageName === null ? [] : [ref.packageName],
            ),
        ),
    ];
    return {
        projectName,
        refs: [...refs.values()],
        localModels: [...localModels].sort(),
        installedPackageModels: [...installedPackageModels].sort(),
        referencedProjects: references.filter((name) => name !== projectName),
        declaredUpstreams,
        installedPackages,
        ...(projectName !== null && references.includes(projectName)
            ? { referencesOwnProject: true }
            : {}),
    };
};
