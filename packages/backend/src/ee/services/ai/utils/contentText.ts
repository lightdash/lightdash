import {
    getErrorMessage,
    ParameterError,
    type ChartAsCode,
    type ContentTextEdit,
    type DashboardAsCode,
} from '@lightdash/common';
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

// JSON values only: undefined keys and Dates would otherwise diff as edits.
const toJsonValue = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(toJsonValue);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, child]) => child !== undefined)
                .map(([key, child]) => [key, toJsonValue(child)]),
        );
    }
    return value;
};

/** Content the model reads and edits as text. */
export type TextContent =
    | { type: 'dashboard'; content: DashboardAsCode }
    | { type: 'chart'; content: ChartAsCode };

// Saves drop a null chartConfig.config (table charts), so the view does too.
const asSaved = (read: TextContent): object => {
    if (read.type !== 'chart' || read.content.chartConfig.config != null)
        return read.content;
    const { config: _config, ...chartConfig } = read.content.chartConfig;
    return { ...read.content, chartConfig };
};

/** The view of content the model reads and edits: content minus read-only keys. */
export const toContentView = (read: TextContent): Record<string, unknown> =>
    Object.fromEntries(
        Object.entries(asSaved(read))
            .filter(
                ([key, value]) => !HIDDEN_KEYS.has(key) && value !== undefined,
            )
            .map(([key, value]) => [key, toJsonValue(value)]),
    );

/** Stable YAML for a content view: the exact text edits match against. */
export const serializeContentView = (view: Record<string, unknown>): string =>
    stringifyYaml(view, { lineWidth: 0 });

export const serializeContent = (read: TextContent): string =>
    serializeContentView(toContentView(read));

const parseContentText = (text: string): unknown => {
    try {
        return parseYaml(text);
    } catch (error) {
        throw new ParameterError(
            `The edited content is not valid YAML: ${getErrorMessage(error)}`,
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
    read: TextContent,
    edits: ContentTextEdit[],
): JsonPatch.Operation[] => {
    const view = toContentView(read);
    const edited = parseContentText(
        applyTextEdits(serializeContentView(view), edits),
    );
    if (edited === null || typeof edited !== 'object' || Array.isArray(edited))
        throw new ParameterError('The edited content must be an object.');
    // Test ops refuse the save if an edited value changed after this read.
    const patch = JsonPatch.compare(view, edited, true);
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
