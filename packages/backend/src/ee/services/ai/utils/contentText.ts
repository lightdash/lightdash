import { ParameterError, type ContentTextEdit } from '@lightdash/common';
import * as JsonPatch from 'fast-json-patch';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { toAbsoluteHref } from './absoluteHref';

export type TextEditableContentType =
    | 'dashboard'
    | 'chart'
    | 'sql_chart'
    | 'composer_chart';

// Read-only or volatile top-level keys; the read header carries the slug.
const HIDDEN_KEYS = new Set([
    'slug',
    'contentType',
    'version',
    'updatedAt',
    'downloadedAt',
    'verification',
    'verified',
    'ownerEmail',
]);

const MAX_HINT_LINES = 12;

/** The view of content the model reads and edits: content minus read-only keys. */
export const toContentView = (content: object): Record<string, unknown> =>
    Object.fromEntries(
        Object.entries(content).filter(([key]) => !HIDDEN_KEYS.has(key)),
    );

/** Stable YAML for a content view: the exact text edits match against. */
export const serializeContentView = (view: Record<string, unknown>): string =>
    stringifyYaml(view, { lineWidth: 0 });

export const serializeContent = (content: object): string =>
    serializeContentView(toContentView(content));

const parseContentText = (text: string): unknown => {
    try {
        return parseYaml(text);
    } catch (error) {
        throw new ParameterError(
            `The edited content is not valid YAML: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }
};

const countOccurrences = (text: string, search: string): number => {
    let count = 0;
    let index = text.indexOf(search);
    while (index !== -1) {
        count += 1;
        index = text.indexOf(search, index + search.length);
    }
    return count;
};

// Votes each line of `old` onto the content line it would start from; returns the best window.
const closestLines = (text: string, old: string): string | null => {
    const lines = text.split('\n');
    const oldLines = old
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    const votes = new Map<number, number>();
    oldLines.forEach((oldLine, offset) => {
        lines.forEach((line, index) => {
            if (line.trim() === oldLine) {
                const start = index - offset;
                votes.set(start, (votes.get(start) ?? 0) + 1);
            }
        });
    });
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best === undefined) return null;
    const from = Math.max(0, best[0] - 1);
    const to = Math.min(
        lines.length,
        from + Math.min(oldLines.length + 2, MAX_HINT_LINES),
    );
    return lines.slice(from, to).join('\n');
};

/** Applies edits in order; all must match exactly once, otherwise nothing changes. */
export const applyTextEdits = (
    text: string,
    edits: ContentTextEdit[],
): string =>
    edits.reduce((current, edit, index) => {
        const label = `Edit ${index + 1} of ${edits.length}`;
        const count = countOccurrences(current, edit.old);
        if (count === 1) return current.replace(edit.old, () => edit.new);
        if (count > 1) {
            throw new ParameterError(
                `${label}: "old" matches ${count} places. Include more surrounding lines so it matches once. No edits were applied.`,
            );
        }
        const hint = closestLines(current, edit.old);
        throw new ParameterError(
            `${label}: "old" was not found${
                index > 0 ? ' after the earlier edits' : ''
            }. No edits were applied. Copy "old" exactly, including indentation and quotes.${
                hint === null ? '' : `\nClosest lines:\n${hint}`
            }`,
        );
    }, text);

/** Turns text edits on the content view into an RFC6902 patch against the stored content. */
export const textEditsToPatch = (
    content: object,
    edits: ContentTextEdit[],
): JsonPatch.Operation[] => {
    const view = toContentView(content);
    const edited = parseContentText(
        applyTextEdits(serializeContentView(view), edits),
    );
    if (edited === null || typeof edited !== 'object' || Array.isArray(edited))
        throw new ParameterError('The edited content must be an object.');
    const patch = JsonPatch.compare(view, edited);
    if (patch.length === 0)
        throw new ParameterError('The edits leave the content unchanged.');
    return patch;
};

/** What a successful write shows the model: where it is and any warnings, never the document. */
export const contentAck = (
    {
        type,
        href,
        slug,
        warnings,
    }: {
        type: TextEditableContentType;
        href: string;
        slug: string;
        warnings: string[];
    },
    siteUrl: string,
): string =>
    [
        `<${type} href="${toAbsoluteHref(siteUrl, href)}" slug="${slug}" />`,
        'Saved.',
        ...warnings,
    ].join('\n');
