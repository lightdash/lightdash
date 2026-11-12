import { isEqual } from 'es-toolkit/compat';
import {
    isCollection,
    isMap,
    isNode,
    isSeq,
    parse,
    parseDocument,
    stringify,
    type Document,
} from 'yaml';

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

type Located = {
    /** Where the part is, or where it would go. */
    at: (string | number)[];
    exists: boolean;
    /** Set when a named entry is missing from its list: the keys below it that the path goes on to name. */
    below: string[] | null;
};

/** Finds a part in a parsed document by the path changes are reported under. */
const locate = (doc: Document, path: string): Located => {
    const segments = path.split('.');
    const at: (string | number)[] = [];
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        const node: unknown = doc.getIn([...at, segment]);
        const name = segments[index + 1];
        // Named by entry even when the list is not there yet, so an entry is never written as a key of a map.
        if (segment in NAMED_LISTS && name !== undefined && at.length === 0) {
            const entry = isSeq(node)
                ? node.items.findIndex(
                      (item) =>
                          isMap(item) &&
                          NAMED_LISTS[segment](asObject(item.toJSON())) ===
                              name,
                  )
                : -1;
            if (entry === -1) {
                return {
                    at: [...at, segment],
                    exists: false,
                    below: segments.slice(index + 2),
                };
            }
            at.push(segment, entry);
            index += 1;
        } else {
            at.push(segment);
        }
    }
    return { at, exists: doc.hasIn(at), below: null };
};

/** Restores one part in place; null when nothing changed. */
const restoreOne = (
    doc: Document,
    liveDoc: Document,
    live: string,
    path: string,
): { removed: boolean } | null => {
    if (readModelPart(doc.toString(), path) === readModelPart(live, path)) {
        return null;
    }
    const theirs = locate(liveDoc, path);
    const mine = locate(doc, path);
    if (!theirs.exists) {
        if (!mine.exists) return null;
        doc.deleteIn(mine.at);
        // An emptied collection goes with its last entry, as when a part is removed by hand; the dimensions list always stays.
        const parent = mine.at.slice(0, -1);
        const siblings: unknown = doc.getIn(parent);
        const isDimensionList =
            parent.length === 1 && parent[0] === 'dimensions';
        if (
            parent.length > 0 &&
            !isDimensionList &&
            isCollection(siblings) &&
            siblings.items.length === 0
        ) {
            doc.deleteIn(parent);
        }
        return { removed: true };
    }
    const node: unknown = liveDoc.getIn(theirs.at, true);
    // Copied by value: an alias would point at nothing, or at something else, in the draft's document.
    const copy = doc.createNode(isNode(node) ? node.toJS(liveDoc) : node, {
        aliasDuplicateObjects: false,
    });
    if (mine.below === null) {
        doc.setIn(mine.at, copy);
        return { removed: false };
    }
    // A key of an entry the draft does not have: there is nothing of the draft's there to put back.
    if (mine.below.length > 0) return null;
    const list: unknown = doc.getIn(mine.at);
    const position = theirs.at.at(-1);
    if (isSeq(list)) {
        list.items.splice(
            typeof position === 'number'
                ? Math.min(position, list.items.length)
                : list.items.length,
            0,
            copy,
        );
    } else {
        doc.setIn(mine.at, doc.createNode([copy]));
    }
    return { removed: false };
};

/**
 * Leaves parts of a drafted model exactly as they are live, whatever live holds
 * when this runs: the live definition is copied over, and a part live does not
 * have is removed. Returns the paths it changed.
 */
export const restoreModelParts = ({
    contents,
    live,
    paths,
}: {
    contents: string;
    live: string;
    paths: string[];
}): {
    contents: string;
    /** Each path that changed, and whether restoring it took the part away. */
    restored: { path: string; removed: boolean }[];
} => {
    const doc = parseDocument(contents);
    const liveDoc = parseDocument(live);
    const restored = paths.flatMap((path) => {
        const outcome = restoreOne(doc, liveDoc, live, path);
        return outcome === null ? [] : [{ path, removed: outcome.removed }];
    });
    return {
        contents: restored.length > 0 ? doc.toString() : contents,
        restored,
    };
};
