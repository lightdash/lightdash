import { isEqual } from 'es-toolkit/compat';
import {
    Document,
    isMap,
    isNode,
    isScalar,
    isSeq,
    parseDocument,
    YAMLMap,
    YAMLSeq,
    type Node,
    type Pair,
} from 'yaml';

type Edit = { start: number; end: number; text: string };

const lineStart = (source: string, offset: number): number =>
    source.lastIndexOf('\n', offset - 1) + 1;

/** Just past the line that holds the character before `offset`. */
const lineEnd = (source: string, offset: number): number => {
    if (offset > 0 && source[offset - 1] === '\n') return offset;
    const next = source.indexOf('\n', offset);
    return next === -1 ? source.length : next + 1;
};

const usesIndentedSequences = (source: string): boolean =>
    !/^( *)[^\s#-][^\n]*:[ \t]*\n\1- /m.test(source);

const render = (value: unknown, column: number, indentSeq: boolean): string =>
    new Document(value)
        .toString({ lineWidth: 0, indentSeq })
        .trimEnd()
        .split('\n')
        .map((line) => (line === '' ? line : ' '.repeat(column) + line))
        .join('\n');

const insertAfter = (source: string, offset: number, block: string): Edit => {
    const at = lineEnd(source, offset);
    const gap = at === source.length && !source.endsWith('\n') ? '\n' : '';
    return { start: at, end: at, text: `${gap}${block}\n` };
};

const removeLines = (source: string, from: number, to: number): Edit => ({
    start: lineStart(source, from),
    end: lineEnd(source, to),
    text: '',
});

// Edits set plain keys and values, where parsing made nodes.
const keyOf = (pair: Pair): string | null => {
    const key = isScalar(pair.key) ? pair.key.value : pair.key;
    return typeof key === 'string' || typeof key === 'number'
        ? String(key)
        : null;
};

const toNode = (value: unknown): Node =>
    isNode(value) ? value : new Document().createNode(value);

const idOf = (item: unknown): string | null => {
    if (!isMap(item)) return null;
    const id = item.get('name') ?? item.get('join');
    return typeof id === 'string' ? id : null;
};

/** Edits that turn `before`'s text into `after`, touching only what differs; null when that cannot be done in place. */
const diffNode = (
    source: string,
    before: Node,
    after: Node,
    indentSeq: boolean,
): Edit[] | null => {
    if (isEqual(before.toJSON(), after.toJSON())) return [];
    if (!before.range) return null;
    const [start, end] = before.range;
    if (isMap(before) && isMap(after) && !before.flow) {
        const edits: Edit[] = [];
        const added: Pair[] = [];
        for (const pair of after.items) {
            const key = keyOf(pair);
            if (key === null) return null;
            const was = before.items.find((item) => keyOf(item) === key);
            if (!was) {
                added.push(pair);
            } else {
                if (!isNode(was.value)) return null;
                const inner = diffNode(
                    source,
                    was.value,
                    toNode(pair.value),
                    indentSeq,
                );
                if (!inner) return null;
                edits.push(...inner);
            }
        }
        for (const pair of before.items) {
            const key = keyOf(pair);
            if (!after.items.some((item) => keyOf(item) === key)) {
                const from = isNode(pair.key) ? pair.key.range?.[0] : undefined;
                const to = isNode(pair.value)
                    ? pair.value.range?.[1]
                    : undefined;
                if (from === undefined || to === undefined) return null;
                edits.push(removeLines(source, from, to));
            }
        }
        if (added.length > 0) {
            const map = new YAMLMap();
            map.items = added;
            edits.push(
                insertAfter(
                    source,
                    end,
                    render(map, start - lineStart(source, start), indentSeq),
                ),
            );
        }
        return edits;
    }
    if (isSeq(before) && isSeq(after) && !before.flow) {
        const byId =
            [...before.items, ...after.items].every((item) => idOf(item)) &&
            new Set(before.items.map(idOf)).size === before.items.length;
        if (!byId && before.items.length !== after.items.length) return null;
        const matchOf = (item: unknown, index: number): unknown =>
            byId
                ? before.items.find((was) => idOf(was) === idOf(item))
                : before.items[index];
        const edits: Edit[] = [];
        const added: unknown[] = [];
        for (const [index, item] of after.items.entries()) {
            const was = matchOf(item, index);
            if (was === undefined) {
                added.push(item);
            } else {
                if (!isNode(was)) return null;
                const inner = diffNode(source, was, toNode(item), indentSeq);
                if (!inner) return null;
                edits.push(...inner);
            }
        }
        if (byId) {
            for (const was of before.items) {
                if (
                    !after.items.some((item) => idOf(item) === idOf(was)) &&
                    isNode(was) &&
                    was.range
                ) {
                    edits.push(removeLines(source, was.range[0], was.range[1]));
                }
            }
        }
        if (added.length > 0) {
            const seq = new YAMLSeq();
            seq.items = added;
            edits.push(
                insertAfter(
                    source,
                    end,
                    render(seq, start - lineStart(source, start), indentSeq),
                ),
            );
        }
        return edits;
    }
    if (isScalar(before) && isScalar(after)) {
        const text = new Document(after).toString({ lineWidth: 0 }).trimEnd();
        return text.includes('\n') ? null : [{ start, end, text }];
    }
    return null;
};

/**
 * Writes a parsed and edited model back over the text it was read from,
 * keeping that text wherever it did not change: no reindented lists, no
 * reflowed descriptions. Falls back to writing the whole document.
 */
export const stringifyKeepingFormat = (
    source: string,
    doc: Document,
): string => {
    const indentSeq = usesIndentedSequences(source);
    const whole = () => doc.toString({ lineWidth: 0, indentSeq });
    const original = parseDocument(source);
    if (
        original.errors.length > 0 ||
        !isNode(original.contents) ||
        !isNode(doc.contents)
    ) {
        return whole();
    }
    const edits = diffNode(source, original.contents, doc.contents, indentSeq);
    if (!edits) return whole();
    // Back to front; at one offset, the outer edit was found last and goes in first, so the inner one lands before it.
    const sorted = edits
        .map((edit, index) => ({ ...edit, index }))
        .sort((a, b) => b.start - a.start || b.index - a.index);
    if (sorted.some((edit, i) => i > 0 && edit.end > sorted[i - 1].start)) {
        return whole();
    }
    const patched = sorted.reduce(
        (text, { start, end, text: replacement }) =>
            text.slice(0, start) + replacement + text.slice(end),
        source,
    );
    const reread = parseDocument(patched);
    return reread.errors.length === 0 && isEqual(reread.toJSON(), doc.toJSON())
        ? patched
        : whole();
};
