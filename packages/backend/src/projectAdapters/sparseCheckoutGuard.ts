import { assertUnreachable, ParameterError } from '@lightdash/common';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import path from 'path';
import { z } from 'zod';

export type SparseCheckoutEscape = {
    file: string;
    key: string;
    value: string;
    reason:
        | 'outside-cone'
        | 'unresolved-template'
        | 'invalid-type'
        | 'unsupported-path'
        | 'symlink';
};

type SparseGuardInput = {
    dir: string;
    project: unknown;
    packages: { file: string; content: unknown }[];
    symlinks: { path: string; target: string }[];
};

const record = z.record(z.string(), z.unknown());
const inside = (root: string, target: string) => {
    const relative = path.posix.relative(root, target);
    return (
        relative !== '..' &&
        !relative.startsWith('../') &&
        !path.posix.isAbsolute(relative)
    );
};

const pathKeys = [
    'model-paths',
    'seed-paths',
    'snapshot-paths',
    'analysis-paths',
    'macro-paths',
    'test-paths',
    'docs-paths',
    'asset-paths',
    'source-paths',
    'data-paths',
];

type Reference = {
    kind: 'directory' | 'local-package';
    file: string;
    key: string;
    base: string;
    value: unknown;
};

const issue = (
    reference: Pick<Reference, 'file' | 'key' | 'value'>,
    reason: SparseCheckoutEscape['reason'],
): SparseCheckoutEscape => ({
    file: reference.file,
    key: reference.key,
    value:
        typeof reference.value === 'string'
            ? reference.value
            : '<invalid type>',
    reason,
});

const referencesIn = (input: SparseGuardInput) => {
    const references: Reference[] = [];
    const issues: SparseCheckoutEscape[] = [];
    const file = path.posix.join(input.dir, 'dbt_project.yml');
    const project = record.safeParse(input.project);
    if (!project.success)
        issues.push(
            issue({ file, key: '$', value: input.project }, 'invalid-type'),
        );
    else {
        for (const key of pathKeys) {
            const value = project.data[key];
            if (value !== undefined) {
                const entries = z.array(z.string()).safeParse(value);
                if (!entries.success)
                    issues.push(issue({ file, key, value }, 'invalid-type'));
                else
                    entries.data.forEach((entry, index) =>
                        references.push({
                            kind: 'directory',
                            file,
                            key: `${key}[${index}]`,
                            base: input.dir,
                            value: entry,
                        }),
                    );
            }
        }
        const installPath = project.data['packages-install-path'];
        if (installPath !== undefined)
            references.push({
                kind: 'directory',
                file,
                key: 'packages-install-path',
                base: input.dir,
                value: installPath,
            });
    }
    input.packages.forEach((document) => {
        const contents = record.safeParse(document.content);
        if (!contents.success) {
            issues.push(
                issue(
                    { file: document.file, key: '$', value: document.content },
                    'invalid-type',
                ),
            );
            return;
        }
        if (contents.data.packages === undefined) return;
        const packages = z.array(record).safeParse(contents.data.packages);
        if (!packages.success) {
            issues.push(
                issue(
                    {
                        file: document.file,
                        key: 'packages',
                        value: contents.data.packages,
                    },
                    'invalid-type',
                ),
            );
            return;
        }
        packages.data.forEach((entry, index) => {
            if (entry.local !== undefined)
                references.push({
                    kind: 'local-package',
                    file: document.file,
                    key: `packages[${index}].local`,
                    base: input.dir,
                    value: entry.local,
                });
        });
    });
    return { references, issues };
};

const checkReference = (
    cone: string,
    reference: Pick<Reference, 'file' | 'key' | 'base' | 'value'>,
): SparseCheckoutEscape[] => {
    const value = z.string().safeParse(reference.value);
    if (!value.success) return [issue(reference, 'invalid-type')];
    if (/\{\{|\{%|\{#/.test(value.data))
        return [issue(reference, 'unresolved-template')];
    if (
        path.posix.isAbsolute(value.data) ||
        path.win32.isAbsolute(value.data) ||
        !inside(cone, path.posix.join(reference.base, value.data))
    )
        return [issue(reference, 'outside-cone')];
    if (/(?:^|\/)[a-z][a-z0-9+.-]*:\/+/i.test(value.data)) {
        return [issue(reference, 'unsupported-path')];
    }
    return [];
};

export const findSparseCheckoutEscapes = (
    cone: string,
    input: SparseGuardInput,
): SparseCheckoutEscape[] => {
    const { references, issues } = referencesIn(input);
    return [
        ...issues,
        ...references.flatMap((reference) => checkReference(cone, reference)),
        ...input.symlinks.flatMap((link) =>
            checkReference(cone, {
                file: link.path,
                key: 'symlink',
                base: path.posix.dirname(link.path),
                value: link.target,
            }).map(
                (escape) =>
                    ({
                        ...escape,
                        reason: 'symlink',
                    }) satisfies SparseCheckoutEscape,
            ),
        ),
    ];
};

const guardError = (cone: string, details: string) =>
    new ParameterError(
        `Sparse git checkout: ${details}. Disable the dbt-sparse-git-checkout feature flag for this organization or move the referenced paths under ${cone}/.`,
    );

export const assertSparseCheckoutComplete = async (
    repoRoot: string,
    cone: string,
    signal?: AbortSignal,
): Promise<void> => {
    signal?.throwIfAborted();
    let repository: string;
    let realCone: string;
    try {
        repository = await fs.realpath(repoRoot);
        const selected = path.resolve(repository, cone);
        if (
            path.isAbsolute(cone) ||
            selected === repository ||
            !inside(repository, selected)
        ) {
            throw guardError(cone, 'invalid project directory');
        }
        realCone = await fs.realpath(selected);
        if (
            realCone !== selected ||
            !(await fs.lstat(realCone)).isDirectory()
        ) {
            throw guardError(
                cone,
                'project directory must be a real directory',
            );
        }
    } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof ParameterError) throw error;
        throw guardError(cone, 'project directory is missing or unreadable');
    }
    const readYamlStrict = async (file: string, optional: boolean) => {
        signal?.throwIfAborted();
        const filename = path.join(repository, file);
        try {
            const stats = await fs.lstat(filename);
            if (
                !stats.isFile() ||
                (await fs.realpath(filename)) !== filename ||
                !inside(realCone, filename)
            ) {
                throw guardError(
                    cone,
                    `${file} must be a regular file inside the selected directory`,
                );
            }
            const content: unknown = yaml.load(
                await fs.readFile(filename, { encoding: 'utf8', signal }),
            );
            if (optional && (content === undefined || content === null))
                return null;
            const parsed = record.safeParse(content);
            if (!parsed.success)
                throw guardError(cone, `${file} must contain a YAML object`);
            return parsed.data;
        } catch (error) {
            signal?.throwIfAborted();
            if (
                optional &&
                z.object({ code: z.literal('ENOENT') }).safeParse(error).success
            )
                return null;
            if (error instanceof ParameterError) throw error;
            throw guardError(
                cone,
                `${file} is missing, unreadable or invalid YAML`,
            );
        }
    };
    const rejectIssues = (issues: SparseCheckoutEscape[]) => {
        if (issues.length > 0)
            throw guardError(
                cone,
                issues
                    .slice(0, 20)
                    .map(
                        (entry) =>
                            `${entry.file} ${entry.key} (${entry.reason})`,
                    )
                    .join('; '),
            );
    };
    const visited = new Set<string>();
    const scan = async (
        dir: string,
        origin: Pick<Reference, 'file' | 'key'> | null,
    ): Promise<void> => {
        signal?.throwIfAborted();
        if (visited.has(dir)) return;
        visited.add(dir);
        const directory = path.join(repository, dir);
        const source =
            origin === null
                ? `${cone} project directory`
                : `${origin.file} ${origin.key}`;
        try {
            if (
                !(await fs.lstat(directory)).isDirectory() ||
                (await fs.realpath(directory)) !== directory ||
                !inside(realCone, directory)
            ) {
                throw guardError(cone, `${source} (not-a-directory)`);
            }
        } catch (error) {
            signal?.throwIfAborted();
            if (error instanceof ParameterError) throw error;
            throw guardError(cone, `${source} (missing-package)`);
        }
        const project = await readYamlStrict(
            path.posix.join(dir, 'dbt_project.yml'),
            false,
        );
        const packages = (
            await Promise.all(
                ['packages.yml', 'dependencies.yml'].map(async (name) => {
                    const file = path.posix.join(dir, name);
                    const content = await readYamlStrict(file, true);
                    return content === null ? [] : [{ file, content }];
                }),
            )
        ).flat();
        const input: SparseGuardInput = {
            dir,
            project,
            packages,
            symlinks: [],
        };
        rejectIssues(findSparseCheckoutEscapes(cone, input));
        await Promise.all(
            referencesIn(input).references.map(async (reference) => {
                switch (reference.kind) {
                    case 'directory':
                        return;
                    case 'local-package':
                        await scan(
                            path.posix.join(
                                reference.base,
                                z.string().parse(reference.value),
                            ),
                            reference,
                        );
                        return;
                    default:
                        assertUnreachable(
                            reference.kind,
                            'Unknown sparse checkout reference',
                        );
                }
            }),
        );
    };
    const walk = async (dir: string): Promise<void> => {
        signal?.throwIfAborted();
        const directory = path.join(repository, dir);
        const entries = await fs
            .readdir(directory, { withFileTypes: true })
            .catch(() => {
                signal?.throwIfAborted();
                throw guardError(cone, `${dir} cannot be inspected`);
            });
        await Promise.all(
            entries
                .filter((entry) => entry.name !== '.git')
                .map(async (entry) => {
                    signal?.throwIfAborted();
                    const file = path.posix.join(dir, entry.name);
                    if (entry.isSymbolicLink()) {
                        const target = await fs
                            .realpath(path.join(repository, file))
                            .catch(() => {
                                signal?.throwIfAborted();
                                throw guardError(
                                    cone,
                                    `${file} symlink is dangling or unreadable`,
                                );
                            });
                        // Rebase realpath targets so absolute in-cone dbt package links also pass.
                        rejectIssues(
                            findSparseCheckoutEscapes(cone, {
                                dir: cone,
                                project: {},
                                packages: [],
                                symlinks: [
                                    {
                                        path: file,
                                        target: path.relative(
                                            path.dirname(
                                                path.join(repository, file),
                                            ),
                                            target,
                                        ),
                                    },
                                ],
                            }),
                        );
                    } else if (entry.isDirectory()) await walk(file);
                }),
        );
    };
    await scan(cone, null);
    await walk(cone);
    signal?.throwIfAborted();
};
