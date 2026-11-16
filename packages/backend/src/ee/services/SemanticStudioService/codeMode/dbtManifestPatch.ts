import {
    isExploreError,
    type DbtManifest,
    type DbtNode,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { isEqual, merge } from 'es-toolkit/compat';
import { parse } from 'yaml';

/** A file of the dbt project as of the stored manifest's commit, and as the change leaves it; null where it does not exist. */
export type DbtFileChange = {
    path: string;
    base: string | null;
    next: string | null;
};

/** A code-mode change to a dbt project, with reads of the branch it goes to; paths are relative to the dbt project. */
export type DbtScriptChange = {
    /** What the script wrote; null removes the file. */
    edits: Map<string, string | null>;
    readHead: (path: string) => Promise<string | null>;
    readAt: (path: string, commitSha: string) => Promise<string | null>;
    /** Null when the branch cannot be compared with that commit. */
    listChangedSince: (commitSha: string) => Promise<string[] | null>;
};

/** Whether a change compiled and works, or why it needs a dbt run to be checked. */
export type DbtScriptCheck =
    | { status: 'unsupported'; reason: string }
    | { status: 'failed'; error: string }
    | {
          status: 'passed';
          changedModels: string[];
          /** The explores the change reaches, as it leaves them. */
          explores: (Explore | ExploreError)[];
      };

export type ManifestPatch =
    | { status: 'patched'; manifest: DbtManifest; changedModels: string[] }
    | { status: 'unsupported'; reason: string };

type Meta = Record<string, unknown>;
type ColumnNode = {
    name: string;
    description?: string;
    meta?: Meta;
    data_type?: unknown;
};
type ModelNode = DbtNode & {
    name: string;
    package_name?: string;
    patch_path?: string | null;
    description?: string;
    meta?: Meta;
    columns?: Record<string, ColumnNode>;
};
type Entry = Record<string, unknown>;

class Unsupported extends Error {}

const refuse = (reason: string): never => {
    throw new Unsupported(reason);
};

const isEntry = (value: unknown): value is Entry =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isModelNode = (node: DbtNode): node is ModelNode =>
    node.resource_type === 'model' && 'name' in node;

const MODEL_KEYS = new Set([
    'name',
    'description',
    'meta',
    'config',
    'columns',
    'tests',
    'data_tests',
]);
const COLUMN_KEYS = new Set([
    'name',
    'description',
    'meta',
    'config',
    'data_type',
    'tests',
    'data_tests',
    'constraints',
]);
const PROJECT_FILES = new Set([
    'dbt_project.yml',
    'packages.yml',
    'dependencies.yml',
    'selectors.yml',
    'lightdash.config.yml',
]);

// dbt renders YAML strings through Jinja, which drops one trailing newline, so a block scalar's description matches the parsed one.
const asDbtRenders = (_key: unknown, value: unknown): unknown =>
    typeof value === 'string' ? value.replace(/(\r\n|\r|\n)$/, '') : value;

const parseYaml = (path: string, text: string | null): Entry => {
    if (text === null) return {};
    let parsed: unknown;
    try {
        parsed = parse(text, asDbtRenders);
    } catch {
        return refuse(`${path} does not parse`);
    }
    if (parsed === null || parsed === undefined) return {};
    return isEntry(parsed) ? parsed : refuse(`${path} is not a mapping`);
};

const byName = (
    path: string,
    list: unknown,
    what: string,
): Map<string, Entry> => {
    if (list === undefined || list === null) return new Map();
    if (!Array.isArray(list))
        return refuse(`${path} has ${what}s that are not a list`);
    const found = new Map<string, Entry>();
    list.forEach((item) => {
        if (!isEntry(item) || typeof item.name !== 'string') {
            refuse(`${path} has a ${what} without a name`);
            return;
        }
        if (found.has(item.name)) refuse(`${path} lists ${item.name} twice`);
        found.set(item.name, item);
    });
    return found;
};

const configOf = (entry: Entry | undefined): Entry =>
    isEntry(entry?.config) ? entry.config : {};

/** Meta the way Lightdash reads it: meta with config.meta on top. */
const effectiveMeta = (entry: Entry | undefined): Meta =>
    merge({}, entry?.meta, configOf(entry).meta);

const assertNoJinja = (label: string, value: unknown) => {
    if (/\{[{%]/.test(JSON.stringify(value) ?? '')) {
        refuse(`${label} uses Jinja, which needs dbt to render`);
    }
};

const assertOnlyMetaChanges = (
    label: string,
    before: Entry | undefined,
    after: Entry,
    allowed: Set<string>,
) => {
    new Set([...Object.keys(before ?? {}), ...Object.keys(after)]).forEach(
        (key) => {
            if (!allowed.has(key) && !isEqual(before?.[key], after[key])) {
                refuse(`${label} changes ${key}, which needs dbt to parse`);
            }
        },
    );
    const { meta: _beforeMeta, ...beforeConfig } = configOf(before);
    const { meta: _afterMeta, ...afterConfig } = configOf(after);
    if (!isEqual(beforeConfig, afterConfig)) {
        refuse(
            `${label} changes config other than meta, which needs dbt to parse`,
        );
    }
};

/**
 * Applies what the YAML changed to the parsed meta, key by key, as dbt layers it:
 * a key the YAML sets replaces the one below, so meta set in dbt_project.yml stays.
 */
// ponytail: a key the YAML drops is dropped even when dbt_project.yml also sets it; rare, the preview project corrects it.
const patchMeta = (
    label: string,
    parsed: Meta,
    before: Meta,
    after: Meta,
): Meta => {
    const meta = { ...parsed };
    new Set([...Object.keys(before), ...Object.keys(after)]).forEach((key) => {
        if (isEqual(before[key], after[key])) return;
        if (key in after) {
            assertNoJinja(`${label} meta ${key}`, after[key]);
            meta[key] = after[key];
        } else {
            delete meta[key];
        }
    });
    return meta;
};

const patchText = (
    label: string,
    current: string | undefined,
    before: unknown,
    after: unknown,
): string | undefined => {
    if (isEqual(before, after)) return current;
    assertNoJinja(label, after);
    return typeof after === 'string' ? after : '';
};

const patchModel = (
    path: string,
    node: ModelNode,
    before: Entry | undefined,
    after: Entry,
): ModelNode => {
    const label = `Model ${node.name}`;
    assertOnlyMetaChanges(label, before, after, MODEL_KEYS);
    const beforeColumns = byName(path, before?.columns, 'column');
    const afterColumns = byName(path, after.columns, 'column');
    const columns = { ...node.columns };
    new Set([...beforeColumns.keys(), ...afterColumns.keys()]).forEach(
        (name) => {
            const prior = beforeColumns.get(name);
            const entry = afterColumns.get(name);
            if (isEqual(prior, entry)) return;
            if (entry === undefined) {
                delete columns[name];
                return;
            }
            const columnLabel = `Column ${name} of ${node.name}`;
            assertOnlyMetaChanges(columnLabel, prior, entry, COLUMN_KEYS);
            const current = columns[name] ?? {
                name,
                description: '',
                meta: {},
            };
            columns[name] = {
                ...current,
                description: patchText(
                    `${columnLabel} description`,
                    current.description,
                    prior?.description,
                    entry.description,
                ),
                data_type: isEqual(prior?.data_type, entry.data_type)
                    ? current.data_type
                    : (entry.data_type ?? null),
                meta: patchMeta(
                    columnLabel,
                    current.meta ?? {},
                    effectiveMeta(prior),
                    effectiveMeta(entry),
                ),
            };
        },
    );
    return {
        ...node,
        description: patchText(
            `${label} description`,
            node.description,
            before?.description,
            after.description,
        ),
        meta: patchMeta(
            label,
            node.meta ?? {},
            effectiveMeta(before),
            effectiveMeta(after),
        ),
        columns,
    };
};

/**
 * Applies changes to dbt properties YAML onto a manifest dbt parsed, without dbt:
 * models' descriptions, meta and columns only. Anything that needs dbt to parse or
 * render is refused, with why, so it can go to a full dbt run instead.
 */
export const patchManifest = (
    manifest: DbtManifest,
    changes: DbtFileChange[],
): ManifestPatch => {
    try {
        const project = manifest.metadata.project_name;
        const nodes = { ...manifest.nodes };
        const changedModels = new Set<string>();
        changes.forEach(({ path, base, next }) => {
            if (base === next) return;
            if (!/\.ya?ml$/.test(path) || PROJECT_FILES.has(path)) {
                refuse(`${path} needs dbt to parse`);
            }
            if (next === null) refuse(`Removing ${path} needs dbt to parse`);
            const {
                models: beforeList,
                version: _bv,
                ...beforeRest
            } = parseYaml(path, base);
            const {
                models: afterList,
                version: _av,
                ...afterRest
            } = parseYaml(path, next);
            if (!isEqual(beforeRest, afterRest)) {
                refuse(
                    `${path} changes more than models, which needs dbt to parse`,
                );
            }
            const beforeModels = byName(path, beforeList, 'model');
            const afterModels = byName(path, afterList, 'model');
            beforeModels.forEach((_entry, name) => {
                if (!afterModels.has(name)) {
                    refuse(`Removing ${name} from ${path} needs dbt to parse`);
                }
            });
            afterModels.forEach((entry, name) => {
                const prior = beforeModels.get(name);
                if (isEqual(prior, entry)) return;
                if ('versions' in entry || (prior && 'versions' in prior)) {
                    refuse(`${name} is versioned, which needs dbt to parse`);
                }
                const matches = Object.entries(nodes).filter(
                    ([, node]) =>
                        isModelNode(node) &&
                        node.name === name &&
                        (project === undefined ||
                            node.package_name === project),
                );
                const [match] = matches;
                if (matches.length !== 1 || !isModelNode(match[1])) {
                    refuse(`There is no model named ${name} to describe`);
                    return;
                }
                const [id, node] = match;
                const patchPath =
                    node.patch_path?.replace(/^[^:]*:\/\//, '') ?? null;
                if (patchPath !== null && patchPath !== path) {
                    refuse(`${name} is described in ${patchPath}, not ${path}`);
                }
                nodes[id] = patchModel(path, node, prior, entry);
                changedModels.add(name);
            });
        });
        return {
            status: 'patched',
            manifest: { ...manifest, nodes },
            changedModels: [...changedModels].sort(),
        };
    } catch (error) {
        if (error instanceof Unsupported) {
            return { status: 'unsupported', reason: error.message };
        }
        throw error;
    }
};

/** The models to compile so every explore a change reaches compiles: the changed ones, those that join them, and what those join. */
export const findModelsToCompile = (
    manifest: DbtManifest,
    changedModels: string[],
): { reached: string[]; uniqueIds: string[] } => {
    const project = manifest.metadata.project_name;
    const models = Object.values(manifest.nodes)
        .filter(isModelNode)
        .filter(
            (node) => project === undefined || node.package_name === project,
        );
    const joinsOf = (node: ModelNode): string[] => {
        const joins = node.meta?.joins;
        return Array.isArray(joins)
            ? joins.flatMap((join) =>
                  isEntry(join) && typeof join.join === 'string'
                      ? [join.join]
                      : [],
              )
            : [];
    };
    const changed = new Set(changedModels);
    const reached = models.filter(
        (node) =>
            changed.has(node.name) ||
            joinsOf(node).some((name) => changed.has(name)),
    );
    const compiled = new Set([
        ...reached.map(({ name }) => name),
        ...reached.flatMap(joinsOf),
    ]);
    return {
        reached: reached.map(({ name }) => name).sort(),
        uniqueIds: models
            .filter(({ name }) => compiled.has(name))
            .map(({ unique_id: uniqueId }) => uniqueId),
    };
};

/**
 * What a change breaks in compiling, against the live explores: an explore that no
 * longer compiles, or a field that no longer does, which a partial compile drops
 * with a warning. What was already broken is not counted.
 */
export const findNewCompileErrors = (
    explores: (Explore | ExploreError)[],
    live: Record<string, Explore | ExploreError>,
): string[] => {
    const where = new Map<string, string[]>();
    explores.forEach((explore) => {
        const before = live[explore.name];
        if (before && isExploreError(before)) return;
        const known = new Set(
            (before?.warnings ?? []).map(({ message }) => message),
        );
        const messages = isExploreError(explore)
            ? [explore.errors.map(({ message }) => message).join('; ')]
            : (explore.warnings ?? [])
                  .map(({ message }) => message)
                  .filter((message) => !known.has(message));
        messages.forEach((message) =>
            where.set(message, [...(where.get(message) ?? []), explore.name]),
        );
    });
    // One explore that joins a broken model repeats its error; each is said once.
    return [...where].map(
        ([message, names]) => `${message} (in ${names.join(', ')})`,
    );
};
