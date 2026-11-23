import { type DbtManifest } from '@lightdash/common';
import path from 'node:path';

const MAX_SOURCES = 30;
const MAX_FOLDERS = 40;
const MAX_EXAMPLE_TABLES = 3;

const text = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

const field = (node: unknown, key: string): string | null =>
    node !== null && typeof node === 'object' && key in node
        ? text((node as Record<string, unknown>)[key])
        : null;

/** "pkg://models/x.yml" to "models/x.yml". */
const filePath = (value: string | null): string | null =>
    value === null ? null : value.replace(/^[^:/]+:\/\//, '');

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const listed = <T>(items: T[], max: number, render: (item: T) => string) => [
    ...items.slice(0, max).map(render),
    ...(items.length > max ? [`- and ${items.length - max} more`] : []),
];

/**
 * The layout of a dbt project as its last compile saw it: where sources are declared and in which
 * database, how model folders and files are named, and the installed packages.
 */
export const describeDbtProjectMap = (manifest: DbtManifest): string | null => {
    const project = text(manifest.metadata.project_name);
    if (project === null) return null;

    const sources = new Map<
        string,
        { location: string; file: string | null; tables: string[] }
    >();
    Object.values(manifest.sources ?? {}).forEach((source: unknown) => {
        if (field(source, 'package_name') !== project) return;
        const name = field(source, 'source_name');
        const table = field(source, 'name');
        if (name === null || table === null) return;
        const location = [field(source, 'database'), field(source, 'schema')]
            .filter((part) => part !== null)
            .join('.');
        const key = `${name}\0${location}`;
        const group = sources.get(key) ?? {
            location,
            file: filePath(field(source, 'original_file_path')),
            tables: [],
        };
        group.tables.push(table);
        sources.set(key, group);
    });

    const folders = new Map<
        string,
        { sql: string; properties: string | null }[]
    >();
    const packages = new Set<string>();
    const adapter = text(manifest.metadata.adapter_type);
    Object.values(manifest.nodes).forEach((node) => {
        const owner = field(node, 'package_name');
        if (owner !== null && owner !== project) packages.add(owner);
        if (owner !== project || field(node, 'resource_type') !== 'model') {
            return;
        }
        const sql = filePath(field(node, 'original_file_path'));
        if (sql === null) return;
        const folder = path.posix.dirname(sql);
        const models = folders.get(folder) ?? [];
        models.push({ sql, properties: filePath(field(node, 'patch_path')) });
        folders.set(folder, models);
    });
    Object.values(manifest.macros ?? {}).forEach((macro: unknown) => {
        const owner = field(macro, 'package_name');
        if (
            owner !== null &&
            owner !== project &&
            owner !== 'dbt' &&
            owner !== `dbt_${adapter}`
        ) {
            packages.add(owner);
        }
    });

    const sourceLines = listed(
        [...sources.entries()].sort(([a], [b]) => a.localeCompare(b)),
        MAX_SOURCES,
        ([key, { location, file, tables }]) => {
            const examples = tables.sort().slice(0, MAX_EXAMPLE_TABLES);
            return `- ${key.split('\0')[0]}${location ? ` in ${location}` : ''}${
                file ? `, declared in ${file}` : ''
            }: ${count(tables.length, 'table')}, such as ${examples.join(', ')}`;
        },
    );
    const folderLines = listed(
        [...folders.entries()].sort(([a], [b]) => a.localeCompare(b)),
        MAX_FOLDERS,
        ([folder, models]) => {
            const [example] = [...models].sort((a, b) =>
                a.sql.localeCompare(b.sql),
            );
            return `- ${folder}: ${count(models.length, 'model')}, such as ${example.sql}${
                example.properties
                    ? ` with properties in ${example.properties}`
                    : ''
            }`;
        },
    );

    return [
        `dbt project ${project}, as its last compile saw it. Files added since then are not listed.`,
        ...(sourceLines.length > 0
            ? [
                  '',
                  'Sources, with where they live and where they are declared:',
                  ...sourceLines,
              ]
            : []),
        ...(folderLines.length > 0
            ? ['', 'Model folders, with one example each:', ...folderLines]
            : []),
        ...(packages.size > 0
            ? ['', `Installed packages: ${[...packages].sort().join(', ')}`]
            : []),
    ].join('\n');
};
