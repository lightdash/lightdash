import { getErrorMessage } from '@lightdash/common';
import {
    newAsyncContext,
    shouldInterruptAfterDeadline,
} from 'quickjs-emscripten';
import {
    Document,
    isMap,
    isScalar,
    isSeq,
    parseDocument,
    visit,
    type YAMLMap,
} from 'yaml';

/** A file the script changed, as it was and as it is now. */
export type DbtFileEdit = { path: string; before: string; after: string };

export type DbtMetricSpec = {
    name: string;
    type: string;
    sql?: string;
    label?: string;
    description?: string;
    filters?: Record<string, unknown>[];
    /** The column the metric sits on; omitted for a model-level metric. */
    column?: string;
};

export type DbtCodeModeResult = {
    edits: DbtFileEdit[];
    logs: string[];
    error: string | null;
};

type Repo = {
    /** The YAML file that describes this model, or null when there is none. */
    findModelFile: (model: string) => Promise<string | null>;
    readFile: (path: string) => Promise<string | null>;
};

/** What the script sees: plain functions over JSON, so nothing of the host leaks in. */
const PRELUDE = `
const call = (fn, ...args) => {
    const out = JSON.parse(fn(...args.map((arg) => JSON.stringify(arg ?? null))));
    if (out.error) throw new Error(out.error);
    return out.value;
};
globalThis.dbt = Object.freeze({
    model: (name) => call(__model, name),
    addMetric: (model, spec) => call(__addMetric, model, spec),
    setDescription: (model, column, description) =>
        call(__setDescription, model, column, description),
});
globalThis.console = { log: (...args) => __log(args.map(String).join(' ')) };
`;

const LINE_WIDTH = 80;

const lineStart = (text: string, pos: number) =>
    text.lastIndexOf('\n', pos - 1) + 1;

/** Just past the newline that ends the line holding `pos`. */
const lineEnd = (text: string, pos: number) => {
    const newline = text.indexOf('\n', pos);
    return newline === -1 ? text.length : newline + 1;
};

/** Renders a value as block YAML at `indent`, folding long strings the way people write them by hand. */
const render = (value: unknown, indent: number): string => {
    const doc = new Document(value);
    visit(doc, {
        Scalar(_, node) {
            if (typeof node.value === 'string' && node.value.length > 60) {
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

const findByName = (seq: unknown, name: string): YAMLMap | null =>
    isSeq(seq)
        ? ((seq.items.find(
              (item) => isMap(item) && item.get('name') === name,
          ) as YAMLMap | undefined) ?? null)
        : null;

/** Where metrics live on a node: `config.meta` when it has one, else `meta`. */
const metaPath = (node: YAMLMap): string[] =>
    isMap(node.getIn(['config', 'meta'])) ? ['config', 'meta'] : ['meta'];

const metricNames = (node: YAMLMap): string[] => {
    const metrics = node.getIn([...metaPath(node), 'metrics']);
    return isMap(metrics) ? metrics.items.map(({ key }) => String(key)) : [];
};

const blockMapOf = (node: unknown, what: string): YAMLMap => {
    if (!isMap(node) || node.flow || !node.range || node.items.length === 0) {
        throw new Error(`${what} is not a block mapping that can be edited`);
    }
    return node;
};

const keyIndent = (text: string, map: YAMLMap) => {
    const keyStart = (map.items[0].key as { range: [number] }).range[0];
    return keyStart - lineStart(text, keyStart);
};

/** Runs a script against the dbt project's YAML in a QuickJS sandbox: no network, no filesystem, a deadline and a memory cap. Edits splice into the original text, so untouched lines stay byte for byte. */
export const runDbtCodeMode = async (
    script: string,
    repo: Repo,
    { timeoutMs = 2000 }: { timeoutMs?: number } = {},
): Promise<DbtCodeModeResult> => {
    const files = new Map<string, { before: string; text: string }>();
    const logs: string[] = [];

    const loadModel = async (model: string) => {
        const path = await repo.findModelFile(model);
        if (!path) throw new Error(`No YAML file describes the model ${model}`);
        let file = files.get(path);
        if (!file) {
            const before = await repo.readFile(path);
            if (before === null) throw new Error(`${path} does not exist`);
            file = { before, text: before };
            files.set(path, file);
        }
        const node = findByName(parseDocument(file.text).get('models'), model);
        if (!node) throw new Error(`${path} does not describe ${model}`);
        return { file, node };
    };

    const targetOf = (node: YAMLMap, column: unknown) => {
        if (!column) return node;
        const found = findByName(node.get('columns'), String(column));
        if (!found) throw new Error(`No column ${column} on this model`);
        return found;
    };

    const ops: Record<string, (...args: unknown[]) => Promise<unknown>> = {
        __model: async (name) => {
            const { file, node } = await loadModel(String(name));
            const columns = node.get('columns');
            return {
                name,
                file: [...files].find(([, f]) => f === file)?.[0],
                description: node.get('description') ?? null,
                metrics: metricNames(node),
                columns: isSeq(columns)
                    ? columns.items.filter(isMap).map((column) => ({
                          name: column.get('name'),
                          description: column.get('description') ?? null,
                          metrics: metricNames(column),
                      }))
                    : [],
            };
        },
        __addMetric: async (model, raw) => {
            const { column, name, ...spec } = raw as DbtMetricSpec;
            const { file, node } = await loadModel(String(model));
            const target = targetOf(node, column);
            const path = [...metaPath(target), 'metrics', name];
            if (target.hasIn(path)) throw new Error(`${name} already exists`);
            // Append under the deepest part of the path that already exists.
            let depth = 0;
            while (isMap(target.getIn(path.slice(0, depth + 1)))) depth += 1;
            const parent = blockMapOf(
                depth === 0 ? target : target.getIn(path.slice(0, depth)),
                path.slice(0, depth).join('.') || 'The model',
            );
            const value = path
                .slice(depth)
                .reduceRight<unknown>(
                    (inner, key) => ({ [key]: inner }),
                    Object.fromEntries(
                        Object.entries(spec).filter(([, v]) => v !== undefined),
                    ),
                );
            const at = lineEnd(file.text, parent.range![1] - 1);
            file.text =
                file.text.slice(0, at) +
                render(value, keyIndent(file.text, parent)) +
                file.text.slice(at);
            return null;
        },
        __setDescription: async (model, column, description) => {
            const { file, node } = await loadModel(String(model));
            const target = blockMapOf(targetOf(node, column), 'The target');
            const text = render(
                { description: String(description) },
                keyIndent(file.text, target),
            );
            const pair = target.items.find(
                ({ key }) => isScalar(key) && key.value === 'description',
            );
            const anchor = (pair ?? target.items[0]) as {
                key: { range: [number] };
                value: { range: [number, number] } | null;
            };
            const start = pair
                ? lineStart(file.text, anchor.key.range[0])
                : lineEnd(file.text, anchor.value!.range[1] - 1);
            const end = pair
                ? lineEnd(file.text, anchor.value!.range[1] - 1)
                : start;
            file.text = file.text.slice(0, start) + text + file.text.slice(end);
            return null;
        },
    };

    const vm = await newAsyncContext();
    try {
        vm.runtime.setMemoryLimit(32 * 1024 * 1024);
        vm.runtime.setInterruptHandler(
            shouldInterruptAfterDeadline(Date.now() + timeoutMs),
        );
        Object.entries(ops).forEach(([name, op]) => {
            vm.newAsyncifiedFunction(name, async (...handles) => {
                const args = handles.map((h) => JSON.parse(vm.getString(h)));
                try {
                    return vm.newString(
                        JSON.stringify({ value: await op(...args) }),
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

    return {
        edits: [...files]
            .map(([path, { before, text }]) => ({ path, before, after: text }))
            .filter(({ before, after }) => before !== after),
        logs,
        error: null,
    };
};
