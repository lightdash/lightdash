import { isEqual } from 'es-toolkit/compat';
import { parse, stringify } from 'yaml';

/** One part of a model that differs between two versions of its YAML, addressed the way a fragment's changes are. */
export type ModelPartChange = {
    /** Such as `label`, `metrics.revenue.sql` or `dimensions.amount`; empty for the model as a whole. */
    path: string;
    kind: 'added' | 'removed' | 'changed';
};

type YamlObject = Record<string, unknown>;

const isObject = (value: unknown): value is YamlObject =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asObject = (value: unknown): YamlObject => (isObject(value) ? value : {});

const parseModel = (contents: string): YamlObject => asObject(parse(contents));

/** Parts of a model held as a list of named entries, with how each entry is named. */
const NAMED_LISTS: Record<string, (entry: YamlObject) => unknown> = {
    dimensions: (entry) => entry.name,
    joins: (entry) => entry.alias ?? entry.join,
};

/** Maps of named definitions nested inside an entry. */
const NESTED_MAPS: Record<string, string[]> = {
    dimensions: ['metrics', 'additional_dimensions'],
    joins: [],
};

const toNamed = (list: unknown, nameOf: (entry: YamlObject) => unknown) =>
    new Map(
        (Array.isArray(list) ? list : [])
            .filter(isObject)
            .flatMap((entry): [string, YamlObject][] => {
                const name = nameOf(entry);
                return typeof name === 'string' ? [[name, entry]] : [];
            }),
    );

/** The keys two definitions disagree on, each as its own path. */
const diffKeys = (
    path: string,
    before: YamlObject,
    after: YamlObject,
    skip: string[] = [],
): ModelPartChange[] =>
    [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter(
            (key) => !skip.includes(key) && !isEqual(before[key], after[key]),
        )
        .map((key) => ({
            path: path ? `${path}.${key}` : key,
            kind: 'changed' as const,
        }));

/** Named definitions that came, went, or changed on some key. */
const diffNamed = (
    path: string,
    before: Map<string, YamlObject>,
    after: Map<string, YamlObject>,
    nested: string[],
): ModelPartChange[] =>
    [...new Set([...before.keys(), ...after.keys()])].flatMap((name) => {
        const entryPath = `${path}.${name}`;
        const was = before.get(name);
        const is = after.get(name);
        if (!was) return [{ path: entryPath, kind: 'added' as const }];
        if (!is) return [{ path: entryPath, kind: 'removed' as const }];
        return [
            ...diffKeys(entryPath, was, is, nested),
            ...nested.flatMap((key) =>
                diffNamed(
                    `${entryPath}.${key}`,
                    new Map(
                        Object.entries(asObject(was[key])).filter(
                            (entry): entry is [string, YamlObject] =>
                                isObject(entry[1]),
                        ),
                    ),
                    new Map(
                        Object.entries(asObject(is[key])).filter(
                            (entry): entry is [string, YamlObject] =>
                                isObject(entry[1]),
                        ),
                    ),
                    [],
                ),
            ),
        ];
    });

const toMap = (value: unknown) =>
    new Map(
        Object.entries(asObject(value)).filter(
            (entry): entry is [string, YamlObject] => isObject(entry[1]),
        ),
    );

/**
 * What differs between two versions of a model, part by part. Paths match the
 * ones `applyModelFragment` reports, so a change made in one place can be set
 * against a change made in another. A null version is a model that is not there.
 */
export const diffModelDocuments = (
    before: string | null,
    after: string | null,
): ModelPartChange[] => {
    if (before === after) return [];
    if (before === null) return [{ path: '', kind: 'added' }];
    if (after === null) return [{ path: '', kind: 'removed' }];
    const was = parseModel(before);
    const is = parseModel(after);
    return [
        ...diffKeys('', was, is, [...Object.keys(NAMED_LISTS), 'metrics']),
        ...Object.entries(NAMED_LISTS).flatMap(([key, nameOf]) =>
            diffNamed(
                key,
                toNamed(was[key], nameOf),
                toNamed(is[key], nameOf),
                NESTED_MAPS[key],
            ),
        ),
        ...diffNamed('metrics', toMap(was.metrics), toMap(is.metrics), []),
    ];
};

/** Whether two paths name the same part of a model, or one names a part inside the other. */
export const doModelPathsOverlap = (a: string, b: string): boolean =>
    a === b ||
    a === '' ||
    b === '' ||
    a.startsWith(`${b}.`) ||
    b.startsWith(`${a}.`);

/** The value at a path of a model as parsed YAML; undefined when the part is not there. */
const readModelPartValue = (contents: string | null, path: string): unknown => {
    if (contents === null) return undefined;
    return path.split('.').reduce<{
        at: unknown;
        list: string | null;
    }>(
        ({ at, list }, segment) => {
            if (list !== null) {
                return {
                    at: toNamed(at, NAMED_LISTS[list]).get(segment),
                    list: null,
                };
            }
            const next = asObject(at)[segment];
            return {
                at: next,
                list:
                    segment in NAMED_LISTS && Array.isArray(next)
                        ? segment
                        : null,
            };
        },
        { at: parseModel(contents), list: null },
    ).at;
};

/** The YAML at a path of a model, for showing one version of a part beside another; null when the part is not there. */
export const readModelPart = (
    contents: string | null,
    path: string,
): string | null => {
    if (contents === null) return null;
    if (path === '') return contents.trimEnd();
    const value = readModelPartValue(contents, path);
    if (value === undefined) return null;
    return isObject(value) || Array.isArray(value)
        ? stringify(value).trimEnd()
        : String(value);
};

/** Whether a path names a whole definition (a field or a join) and not one key of something. */
const isWholePart = (segments: string[]): boolean =>
    segments.length === 2
        ? segments[0] in NAMED_LISTS || segments[0] === 'metrics'
        : segments.length === 4 && segments[0] === 'dimensions';

/** Wraps a value in the shape a fragment gives the part at a path. */
const nestAt = (
    segments: string[],
    value: unknown,
    live: string,
): YamlObject => {
    const [head, name, ...rest] = segments;
    if (name === undefined) return { [head]: value };
    const inner = (keys: string[]): unknown =>
        keys.length === 0 ? value : { [keys[0]]: inner(keys.slice(1)) };
    if (head === 'dimensions') {
        return {
            dimensions: [
                rest.length === 0 ? value : { name, ...asObject(inner(rest)) },
            ],
        };
    }
    if (head === 'joins') {
        const { join, alias } = asObject(
            readModelPartValue(live, `joins.${name}`),
        );
        return {
            joins: [
                rest.length === 0
                    ? value
                    : {
                          join,
                          ...(alias === undefined ? {} : { alias }),
                          ...asObject(inner(rest)),
                      },
            ],
        };
    }
    return { [head]: { [name]: inner(rest) } };
};

/**
 * The changes that leave one part of a drafted model as it is live, in the
 * order to make them: each is a fragment to merge and the parts to remove.
 * Empty when the draft already matches live there.
 */
export const buildModelPartRestore = ({
    live,
    mine,
    path,
}: {
    live: string;
    mine: string | null;
    path: string;
}): { yaml: string | null; remove: string[] }[] => {
    const segments = path.split('.');
    const liveValue = readModelPartValue(live, path);
    const hasMine = readModelPartValue(mine, path) !== undefined;
    if (isWholePart(segments)) {
        return [
            // Removed first, so what comes back is exactly the live definition and not a merge of the two.
            ...(hasMine ? [{ yaml: null, remove: [path] }] : []),
            ...(liveValue === undefined
                ? []
                : [
                      {
                          yaml: stringify(nestAt(segments, liveValue, live)),
                          remove: [],
                      },
                  ]),
        ];
    }
    if (liveValue === undefined && !hasMine) return [];
    return [
        {
            yaml: stringify(nestAt(segments, liveValue ?? null, live)),
            remove: [],
        },
    ];
};
