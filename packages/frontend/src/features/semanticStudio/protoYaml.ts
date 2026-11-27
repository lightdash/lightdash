import { load } from 'js-yaml';

const indentOf = (line: string) => line.length - line.trimStart().length;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** A field's block is one list item (`- name: x`) or one named entry (`x:`); either way its properties are a map. */
const rootOf = (block: string): Record<string, unknown> | null => {
    try {
        const parsed = load(block);
        const root = Array.isArray(parsed)
            ? parsed[0]
            : isRecord(parsed)
              ? Object.values(parsed)[0]
              : null;
        return isRecord(root) ? root : null;
    } catch {
        return null;
    }
};

const walk = (root: Record<string, unknown>, path: string[]): unknown =>
    path.reduce<unknown>(
        (node, key) => (isRecord(node) ? node[key] : undefined),
        root,
    );

// Where a model keeps a field's words: on the field itself, or under dbt's meta
const HOMES = [[], ['config', 'meta', 'dimension'], ['meta', 'dimension']];

const homeOf = (block: string, key: string, isDbtColumn: boolean): string[] => {
    const root = rootOf(block);
    if (!root) return [];
    const has = HOMES.find((home) => walk(root, [...home, key]) !== undefined);
    if (has) return has;
    if (!isDbtColumn) return [];
    const made = HOMES.slice(1).find((home) => isRecord(walk(root, home)));
    return made ?? ('config' in root ? HOMES[1] : HOMES[2]);
};

/** What a property says in the block; a list reads as lines. */
export const readProperty = (
    block: string,
    key: string,
    isDbtColumn: boolean,
): string => {
    const root = rootOf(block);
    if (!root) return '';
    const value = walk(root, [...homeOf(block, key, isDbtColumn), key]);
    if (Array.isArray(value)) return value.join('\n');
    return value === undefined || value === null ? '' : String(value);
};

const PLAIN = /^[A-Za-z0-9_(][^:#\n]*[^\s:#]$|^[A-Za-z0-9]$/;
const RESERVED = /^(true|false|yes|no|null|on|off|~|[-+.\d][\d._eE+-]*)$/i;

const scalar = (key: string, value: string, pad: string): string[] =>
    value.includes('\n')
        ? [
              `${pad}${key}: |-`,
              ...value
                  .split('\n')
                  .map((line) => (line === '' ? '' : `${pad}  ${line}`)),
          ]
        : [
              `${pad}${key}: ${
                  PLAIN.test(value) && !RESERVED.test(value)
                      ? value
                      : JSON.stringify(value)
              }`,
          ];

/** Rewrites one property in the block's own text, leaving every other line as it was typed; an empty value removes it. */
export const writeProperty = (
    block: string,
    key: string,
    value: string,
    isDbtColumn: boolean,
): string => {
    const lines = block.split('\n');
    const first = lines.findIndex((line) => line.trim() !== '');
    if (first === -1) return block;
    // A list item's properties line up after its dash; a named entry's sit one step in
    let indent =
        indentOf(lines[first]) +
        (lines[first].trimStart().startsWith('- ') ? 2 : 2);
    let start = first;
    let end = lines.length;
    const path = [...homeOf(block, key, isDbtColumn), key];
    const find = (name: string) => {
        for (let index = start; index < end; index += 1) {
            const text =
                index === first
                    ? lines[index].replace(/^(\s*)- /, '$1  ')
                    : lines[index];
            if (
                indentOf(text) === indent &&
                (text.trim() === `${name}:` ||
                    text.trim().startsWith(`${name}: `))
            )
                return index;
        }
        return -1;
    };
    const extentOf = (at: number) => {
        let last = at + 1;
        for (let index = at + 1; index < end; index += 1) {
            if (lines[index].trim() === '') continue;
            if (indentOf(lines[index]) <= indent) break;
            last = index + 1;
        }
        return last;
    };
    for (const [depth, name] of path.entries()) {
        const isLeaf = depth === path.length - 1;
        const at = find(name);
        const pad = ' '.repeat(indent);
        if (isLeaf) {
            const next = value.trim() === '' ? [] : scalar(name, value, pad);
            if (at === -1) {
                // New words go right under the parent's first line, where people look for them
                lines.splice(
                    start === first && depth === 0 ? first + 1 : start,
                    0,
                    ...next,
                );
            } else if (at === first) {
                return block;
            } else {
                lines.splice(at, extentOf(at) - at, ...next);
            }
            return lines.join('\n');
        }
        if (at === -1) {
            if (value.trim() === '') return block;
            const insertAt = (() => {
                let last = end;
                while (last > start + 1 && lines[last - 1].trim() === '')
                    last -= 1;
                return last;
            })();
            lines.splice(insertAt, 0, `${pad}${name}:`);
            start = insertAt + 1;
            end = insertAt + 1;
        } else {
            end = extentOf(at);
            start = at + 1;
        }
        indent += 2;
    }
    return lines.join('\n');
};
