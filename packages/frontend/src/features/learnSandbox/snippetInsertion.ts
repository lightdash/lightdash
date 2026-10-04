/**
 * Where the tour puts a lesson's snippet. A snippet starts with the key it
 * extends (`metrics:`, `additional_dimensions:`) followed by its children;
 * the children are typed in directly under the last line in the file that
 * is that same key at that same indent, so they land where a developer
 * would write them and the card shows the path they take. A file without
 * that key gets the whole snippet under the last key one level up, and a
 * snippet that names no key is appended. The lesson compile test inserts
 * the same way, so what it compiles is what the editor produces.
 */
export type SnippetInsertion = {
    /** Character offset the text is typed in at. */
    offset: number;
    /** Text before it: a newline when appending to an open line. */
    prefix: string;
    /** Text after it: a newline when lines follow. */
    suffix: string;
    /** What is typed: the snippet's children when its key already exists. */
    text: string;
    /** Zero-based line of the key the text goes under, or null when appended. */
    parentLine: number | null;
};

const escapeRegExp = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const under = (
    content: string,
    lines: string[],
    parentLine: number,
    text: string,
): SnippetInsertion => {
    const lineEnd = lines.slice(0, parentLine + 1).join('\n').length;
    return lineEnd >= content.length
        ? { offset: content.length, prefix: '\n', suffix: '', text, parentLine }
        : { offset: lineEnd + 1, prefix: '', suffix: '\n', text, parentLine };
};

export const insertionPoint = (
    content: string,
    snippet: string,
): SnippetInsertion => {
    const lines = content.split('\n');
    const snippetLines = snippet.split('\n');
    const head = /^( *)([^\s#-][^:]*):\s*$/.exec(snippetLines[0]);
    if (head && snippetLines.length > 1) {
        const [, indent, key] = head;
        const sameKey = new RegExp(`^${indent}${escapeRegExp(key)}:\\s*$`);
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            if (sameKey.test(lines[index])) {
                return under(
                    content,
                    lines,
                    index,
                    snippetLines.slice(1).join('\n'),
                );
            }
        }
    }
    const indent = /^ */.exec(snippet)![0].length;
    if (indent >= 2) {
        const parentKey = new RegExp(`^ {${indent - 2}}[^\\s#-][^:]*:\\s*$`);
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            if (parentKey.test(lines[index])) {
                return under(content, lines, index, snippet);
            }
        }
    }
    return {
        offset: content.length,
        prefix: content.length === 0 || content.endsWith('\n') ? '' : '\n',
        suffix: '',
        text: snippet,
        parentLine: null,
    };
};

export const insertSnippet = (content: string, snippet: string): string => {
    const { offset, prefix, suffix, text } = insertionPoint(content, snippet);
    return `${content.slice(0, offset)}${prefix}${text}${suffix}${content.slice(offset)}`;
};

/**
 * Whether the file has the entry a lesson's snippet adds. The snippet's
 * first line is the key it goes under, already in the file; the line after
 * it names the entry (`- name: number_of_floors`, `average_payment_amount:`).
 * That line alone is looked for, whatever its indent, so a learner typing by
 * hand is not held to the snippet's exact wording below it.
 */
export const holdsEntry = (content: string, snippet: string): boolean => {
    const lines = snippet.split('\n');
    const entry = (lines.length > 1 ? lines[1] : lines[0]).trim();
    return (
        entry !== '' &&
        content.split('\n').some((line) => line.trim() === entry)
    );
};

/**
 * Where a one-line edit lands: a content-as-code lesson sets one top-level
 * `key: value` line of a downloaded file (a chart's `name:`) to a new value.
 * The line is replaced whole, wherever the key sits. A file that has lost
 * the key gets the line back at its end. Null when the line already reads
 * that way, or is not a single `key: value` line.
 */
export const replacementFor = (
    content: string,
    line: string,
): { from: number; to: number; text: string } | null => {
    const key = /^([A-Za-z_][\w-]*):\s/.exec(line)?.[1];
    if (!key || line.includes('\n')) return null;
    const sameKey = new RegExp(`^${escapeRegExp(key)}:(?:\\s|$)`);
    let offset = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const current of content.split('\n')) {
        if (sameKey.test(current)) {
            return current === line
                ? null
                : { from: offset, to: offset + current.length, text: line };
        }
        offset += current.length + 1;
    }
    const opensNewLine = content === '' || content.endsWith('\n');
    return {
        from: content.length,
        to: content.length,
        text: `${opensNewLine ? '' : '\n'}${line}\n`,
    };
};

/** The file with that one line set, as Use it leaves it. */
export const replaceLine = (content: string, line: string): string => {
    const replacement = replacementFor(content, line);
    return replacement
        ? content.slice(0, replacement.from) +
              replacement.text +
              content.slice(replacement.to)
        : content;
};
