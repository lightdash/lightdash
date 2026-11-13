import { getErrorMessage } from '@lightdash/common';
import {
    newAsyncContext,
    shouldInterruptAfterDeadline,
} from 'quickjs-emscripten';
import {
    Document,
    isMap,
    isNode,
    isScalar,
    isSeq,
    parseDocument,
    visit,
    type Pair,
    type YAMLMap,
    type YAMLSeq,
} from 'yaml';

/** A file the script changed; `before` is null for a new file, `after` null for a deleted one. */
export type CodeModeFileEdit = {
    path: string;
    before: string | null;
    after: string | null;
};

export type CodeModeResult = {
    edits: CodeModeFileEdit[];
    logs: string[];
    error: string | null;
};

/** The project's repository as the script may see it, with paths relative to the project. */
export type CodeModeRepo = {
    list: () => Promise<string[]>;
    read: (path: string) => Promise<string | null>;
    /** Where a model is defined, from the project's compiled explores. */
    findModel: (
        name: string,
    ) => Promise<{ yml: string | null; sql: string | null } | null>;
    /** Why a changed YAML file is not valid semantic layer, or null when it is. */
    validateYaml: (path: string, text: string) => string | null;
};

/** A step into YAML: a mapping key, a list index, or the list item with this `name`. */
type Segment = string | number | { name: string };

/** What the script sees: plain functions over JSON, so nothing of the host leaks in. */
const PRELUDE = `
const call = (fn, ...args) => {
    const out = JSON.parse(fn(...args.map((arg) => JSON.stringify(arg === undefined ? null : arg))));
    if (out.error) throw new Error(out.error);
    return out.value;
};
globalThis.repo = Object.freeze({
    list: (prefix) => call(__list, prefix),
    read: (path) => call(__read, path),
    write: (path, text) => call(__write, path, text),
    remove: (path) => call(__remove, path),
});
globalThis.yaml = Object.freeze({
    get: (path, keys) => call(__yamlGet, path, keys),
    set: (path, keys, value) => call(__yamlSet, path, keys, value),
    push: (path, keys, value) => call(__yamlPush, path, keys, value),
    remove: (path, keys) => call(__yamlRemove, path, keys),
});
globalThis.dbt = Object.freeze({
    model: (name) => call(__model, name),
});
globalThis.console = { log: (...args) => __log(args.map((a) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')) };
`;

const LINE_WIDTH = 80;

const lineStart = (text: string, pos: number) =>
    text.lastIndexOf('\n', pos - 1) + 1;

/** Just past the newline that ends the line holding `pos`. */
const lineEnd = (text: string, pos: number) => {
    const newline = text.indexOf('\n', pos);
    return newline === -1 ? text.length : newline + 1;
};

const rangeOf = (node: unknown): [number, number, number] => {
    if (!isNode(node) || !node.range) throw new Error('Cannot locate a node');
    return node.range;
};

/** Renders a value as block YAML at `indent`, folding long strings the way people write them by hand. */
const render = (value: unknown, indent: number): string => {
    const doc = new Document(value);
    visit(doc, {
        Scalar(_, node) {
            if (
                typeof node.value === 'string' &&
                node.value.length > 60 &&
                !node.value.includes('\n')
            ) {
                // eslint-disable-next-line no-param-reassign
                node.type = 'BLOCK_FOLDED';
            }
        },
    });
    return doc
        .toString({ lineWidth: LINE_WIDTH - indent })
        .trimEnd()
        .split('\n')
        .map((line) => (line ? `${' '.repeat(indent)}${line}` : line))
        .join('\n')
        .concat('\n');
};

const keyOf = (pair: Pair) => (isScalar(pair.key) ? pair.key.value : pair.key);

const keyIndent = (text: string, map: YAMLMap) => {
    const start = rangeOf(map.items[0].key)[0];
    return start - lineStart(text, start);
};

const dashIndent = (text: string, seq: YAMLSeq) => {
    const start = lineStart(text, rangeOf(seq.items[0])[0]);
    return text.indexOf('-', start) - start;
};

const isBlock = (node: unknown): node is YAMLMap | YAMLSeq =>
    (isMap(node) || isSeq(node)) && !node.flow && node.items.length > 0;

const describe = (keys: Segment[]) =>
    keys
        .map((key) => (typeof key === 'object' ? `[name=${key.name}]` : key))
        .join('.') || 'the document';

type Hit = {
    node: unknown;
    map: YAMLMap | null;
    pair: Pair | null;
    seq: YAMLSeq | null;
};

/** Walks as far along `keys` as the document goes; one hit per step taken, plus the root. */
const resolve = (doc: Document, keys: Segment[]): Hit[] => {
    const hits: Hit[] = [
        { node: doc.contents, map: null, pair: null, seq: null },
    ];
    for (const key of keys) {
        const { node } = hits[hits.length - 1];
        if (typeof key === 'string' && isMap(node)) {
            const pair = node.items.find((item) => keyOf(item) === key);
            if (!pair) break;
            hits.push({ node: pair.value, map: node, pair, seq: null });
        } else if (typeof key !== 'string' && isSeq(node)) {
            const index =
                typeof key === 'number'
                    ? key
                    : node.items.findIndex(
                          (item) =>
                              isMap(item) && item.get('name') === key.name,
                      );
            if (index < 0 || index >= node.items.length) break;
            hits.push({
                node: node.items[index],
                map: null,
                pair: null,
                seq: node,
            });
        } else break;
    }
    return hits;
};

/** The text a resolved pair or list item occupies, whole lines. */
const spanOf = (text: string, hit: Hit): [number, number] => {
    const first = hit.pair ? hit.pair.key : hit.node;
    const last = hit.pair ? (hit.pair.value ?? hit.pair.key) : hit.node;
    return [
        lineStart(text, rangeOf(first)[0]),
        lineEnd(text, rangeOf(last)[1] - 1),
    ];
};

const nest = (keys: Segment[], value: unknown): unknown =>
    keys.reduceRight<unknown>((inner, key) => {
        if (typeof key !== 'string') {
            throw new Error(
                `${describe([key])} does not exist; add list items with yaml.push`,
            );
        }
        return { [key]: inner };
    }, value);

const splice = (text: string, [start, end]: [number, number], insert: string) =>
    text.slice(0, start) + insert + text.slice(end);

/** Edits YAML text in place: untouched lines stay byte for byte. */
const yamlEdits = {
    set: (text: string, keys: Segment[], value: unknown): string => {
        const doc = parseDocument(text);
        const hits = resolve(doc, keys);
        const found = hits.length - 1;
        const last = hits[found];
        if (keys.length === 0 || !isNode(doc.contents)) {
            return new Document(nest(keys, value)).toString({ lineWidth: 0 });
        }
        if (found === keys.length) {
            if (last.pair && last.map) {
                return splice(
                    text,
                    spanOf(text, last),
                    render(
                        { [String(keyOf(last.pair))]: value },
                        keyIndent(text, last.map),
                    ),
                );
            }
            return splice(
                text,
                spanOf(text, last),
                render([value], dashIndent(text, last.seq!)),
            );
        }
        const rest = nest(keys.slice(found), value);
        if (isMap(last.node) && isBlock(last.node)) {
            const at = lineEnd(text, rangeOf(last.node)[1] - 1);
            return splice(
                text,
                [at, at],
                render(rest, keyIndent(text, last.node)),
            );
        }
        if (last.pair && last.map) {
            // An empty or inline value under this key: write the key out in block form.
            const current = isNode(last.node) ? last.node.toJSON() : null;
            return splice(
                text,
                spanOf(text, last),
                render(
                    {
                        [String(keyOf(last.pair))]: {
                            ...(current && typeof current === 'object'
                                ? current
                                : {}),
                            ...(rest as object),
                        },
                    },
                    keyIndent(text, last.map),
                ),
            );
        }
        throw new Error(`Cannot add ${describe(keys)} here`);
    },
    push: (text: string, keys: Segment[], value: unknown): string => {
        const hits = resolve(parseDocument(text), keys);
        const { node } = hits[hits.length - 1];
        if (hits.length - 1 === keys.length && isSeq(node) && isBlock(node)) {
            const at = lineEnd(text, rangeOf(node)[1] - 1);
            return splice(
                text,
                [at, at],
                render([value], dashIndent(text, node)),
            );
        }
        if (hits.length - 1 === keys.length && isNode(node)) {
            const current = node.toJSON();
            if (!Array.isArray(current) && current !== null) {
                throw new Error(`${describe(keys)} is not a list`);
            }
            return yamlEdits.set(text, keys, [...(current ?? []), value]);
        }
        return yamlEdits.set(text, keys, [value]);
    },
    remove: (text: string, keys: Segment[]): string => {
        const hits = resolve(parseDocument(text), keys);
        if (hits.length - 1 !== keys.length || keys.length === 0) {
            throw new Error(`${describe(keys)} does not exist`);
        }
        // Take emptied keys with it, so no `metrics:` is left holding nothing.
        let depth = hits.length - 1;
        while (depth > 1) {
            const { map, seq } = hits[depth];
            const container = map ?? seq;
            if (container?.items.length !== 1 || !hits[depth - 1].pair) break;
            depth -= 1;
        }
        return splice(text, spanOf(text, hits[depth]), '');
    },
};

/**
 * Runs a script against the project's repository in a QuickJS sandbox: no network,
 * no host filesystem, a deadline and a memory cap. Every change is in memory until
 * the script finishes and each changed YAML file validates; then all or nothing.
 */
export const runCodeMode = async (
    script: string,
    repo: CodeModeRepo,
    { timeoutMs = 3000 }: { timeoutMs?: number } = {},
): Promise<CodeModeResult> => {
    const files = new Map<
        string,
        { before: string | null; text: string | null }
    >();
    const logs: string[] = [];

    const load = async (path: string) => {
        let file = files.get(path);
        if (!file) {
            const before = await repo.read(path);
            file = { before, text: before };
            files.set(path, file);
        }
        return file;
    };
    const loadYaml = async (path: string) => {
        const file = await load(path);
        if (file.text === null) throw new Error(`${path} does not exist`);
        return file as { before: string | null; text: string };
    };
    const editYaml = async (path: string, edit: (text: string) => string) => {
        const file = await loadYaml(path);
        const next = edit(file.text);
        const { errors } = parseDocument(next);
        if (errors.length > 0) throw new Error(`${path}: ${errors[0].message}`);
        file.text = next;
        return null;
    };
    const keysOf = (raw: unknown): Segment[] => {
        if (!Array.isArray(raw)) throw new Error('keys must be a list');
        return raw as Segment[];
    };

    const ops: Record<string, (...args: unknown[]) => Promise<unknown>> = {
        __list: async (prefix) => {
            const known = new Set(await repo.list());
            files.forEach(({ text }, path) =>
                text === null ? known.delete(path) : known.add(path),
            );
            return [...known]
                .filter((path) => !prefix || path.startsWith(String(prefix)))
                .sort();
        },
        __read: async (path) => (await load(String(path))).text,
        __write: async (path, text) => {
            (await load(String(path))).text = String(text);
            return null;
        },
        __remove: async (path) => {
            const file = await load(String(path));
            if (file.text === null) throw new Error(`${path} does not exist`);
            file.text = null;
            return null;
        },
        __yamlGet: async (path, keys) => {
            const { text } = await loadYaml(String(path));
            const segments = keysOf(keys);
            const hits = resolve(parseDocument(text), segments);
            if (hits.length - 1 !== segments.length) return null;
            const { node } = hits[hits.length - 1];
            return isNode(node) ? node.toJSON() : (node ?? null);
        },
        __yamlSet: (path, keys, value) =>
            editYaml(String(path), (text) =>
                yamlEdits.set(text, keysOf(keys), value),
            ),
        __yamlPush: (path, keys, value) =>
            editYaml(String(path), (text) =>
                yamlEdits.push(text, keysOf(keys), value),
            ),
        __yamlRemove: (path, keys) =>
            editYaml(String(path), (text) =>
                yamlEdits.remove(text, keysOf(keys)),
            ),
        __model: async (name) => {
            const found = await repo.findModel(String(name));
            return found ? { ...found, keys: ['models', { name }] } : null;
        },
    };

    const vm = await newAsyncContext();
    try {
        vm.runtime.setMemoryLimit(64 * 1024 * 1024);
        vm.runtime.setInterruptHandler(
            shouldInterruptAfterDeadline(Date.now() + timeoutMs),
        );
        Object.entries(ops).forEach(([name, op]) => {
            vm.newAsyncifiedFunction(name, async (...handles) => {
                const args = handles.map((h) => JSON.parse(vm.getString(h)));
                try {
                    return vm.newString(
                        JSON.stringify({ value: (await op(...args)) ?? null }),
                    );
                } catch (e) {
                    return vm.newString(
                        JSON.stringify({ error: getErrorMessage(e) }),
                    );
                }
            }).consume((fn) => vm.setProp(vm.global, name, fn));
        });
        vm.newFunction('__log', (h) => {
            logs.push(vm.getString(h));
        }).consume((fn) => vm.setProp(vm.global, '__log', fn));

        const result = await vm.evalCodeAsync(`${PRELUDE}\n${script}`);
        if (result.error) {
            const error = vm.dump(result.error);
            result.error.dispose();
            return {
                edits: [],
                logs,
                error:
                    typeof error === 'object' && error && 'message' in error
                        ? String(error.message)
                        : String(error),
            };
        }
        result.value.dispose();
    } finally {
        vm.dispose();
    }

    const edits = [...files]
        .map(([path, { before, text }]) => ({ path, before, after: text }))
        .filter(({ before, after }) => before !== after);
    const invalid = edits.flatMap(({ path, after }) => {
        if (after === null || !/\.ya?ml$/.test(path)) return [];
        const reason = repo.validateYaml(path, after);
        return reason ? [reason] : [];
    });
    return invalid.length > 0
        ? { edits: [], logs, error: invalid.join('\n') }
        : { edits, logs, error: null };
};
