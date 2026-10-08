import { isEqual } from 'lodash';
import { validate as isUuid } from 'uuid';
import type { DocumentChartContent, DocumentContent } from '../types/document';
import { ParameterError } from '../types/errors';
import { ChartType } from '../types/savedCharts';
import assertUnreachable from './assertUnreachable';

/**
 * Document markdown places charts and other references as block tags: an
 * HTML-like tag alone on an unindented line, outside code fences, e.g.
 * `<document-chart id="c1">`.
 */
export type DocumentTag = {
    name: string;
    attributes: Record<string, string>;
};

export type DocumentBlock =
    | { type: 'markdown'; markdown: string }
    /** `line` is the tag as written, when it was parsed from markdown. */
    | { type: 'tag'; tag: DocumentTag; line?: string };

export const DOCUMENT_CHART_TAG = 'document-chart';
/** Links to a saved chart; the Document shows its latest version. */
export const SAVED_CHART_TAG = 'saved-chart';
/** Links to a saved SQL chart; the Document shows its latest version. */
export const SAVED_SQL_CHART_TAG = 'saved-sql-chart';

export type DocumentSavedChartKind = 'chart' | 'sqlChart';

const SAVED_CHART_TAG_KINDS: Record<string, DocumentSavedChartKind> = {
    [SAVED_CHART_TAG]: 'chart',
    [SAVED_SQL_CHART_TAG]: 'sqlChart',
};

export const getSavedChartTagName = (kind: DocumentSavedChartKind): string =>
    kind === 'chart' ? SAVED_CHART_TAG : SAVED_SQL_CHART_TAG;

/**
 * Lightdash block tag names contain a hyphen, which no HTML element does, so
 * tags added by a newer release are recognised here and kept rather than read
 * as markdown.
 */
export const isDocumentBlockTagName = (name: string): boolean =>
    name.includes('-');

const TAG_LINE_RE =
    /^<([a-z][a-z-]*)((?:\s+[a-z][a-z-]*="[^"]*")*)\s*\/?>(?:<\/\1>)?$/;
const ATTRIBUTE_RE = /([a-z][a-z-]*)="([^"]*)"/g;
const FENCE_RE = /^(`{3,}|~{3,})/;
const DOCUMENT_CHART_ID_RE = /^c([1-9]\d*)$/;

const decodeAttribute = (value: string): string =>
    value
        .replaceAll('&quot;', '"')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');

const encodeAttribute = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');

/** Drop surrounding blank lines, keeping the first line's indentation. */
const trimBlankLines = (lines: string[]): string => {
    const start = lines.findIndex((line) => line.trim() !== '');
    if (start === -1) return '';
    const end = lines.findLastIndex((line) => line.trim() !== '');
    return lines
        .slice(start, end + 1)
        .join('\n')
        .trimEnd();
};

export const parseDocumentBlocks = (
    markdown: string,
    tagNames: readonly string[] | ((name: string) => boolean),
): DocumentBlock[] => {
    const isTagName =
        typeof tagNames === 'function'
            ? tagNames
            : (name: string) => tagNames.includes(name);
    const blocks: DocumentBlock[] = [];
    let lines: string[] = [];
    let fence: string | null = null;
    const flush = () => {
        const text = trimBlankLines(lines);
        if (text) blocks.push({ type: 'markdown', markdown: text });
        lines = [];
    };
    markdown.split(/\r?\n/).forEach((line) => {
        const fenceMatch = FENCE_RE.exec(line.trim());
        if (fence !== null) {
            if (fenceMatch && fenceMatch[1].startsWith(fence)) fence = null;
            lines.push(line);
            return;
        }
        if (fenceMatch) {
            [, fence] = fenceMatch;
            lines.push(line);
            return;
        }
        const tagMatch = TAG_LINE_RE.exec(line.trimEnd());
        if (tagMatch && isTagName(tagMatch[1])) {
            flush();
            blocks.push({
                type: 'tag',
                line: line.trimEnd(),
                tag: {
                    name: tagMatch[1],
                    attributes: Object.fromEntries(
                        [...tagMatch[2].matchAll(ATTRIBUTE_RE)].map(
                            ([, key, value]) => [key, decodeAttribute(value)],
                        ),
                    ),
                },
            });
            return;
        }
        lines.push(line);
    });
    flush();
    return blocks;
};

export const formatDocumentTag = ({ name, attributes }: DocumentTag): string =>
    `<${name}${Object.entries(attributes)
        .map(([key, value]) => ` ${key}="${encodeAttribute(value)}"`)
        .join('')}>`;

export const joinDocumentBlocks = (blocks: DocumentBlock[]): string =>
    blocks
        .map((block) =>
            block.type === 'markdown'
                ? block.markdown
                : formatDocumentTag(block.tag),
        )
        .join('\n\n');

export const getDocumentChartTag = (id: string): string =>
    formatDocumentTag({ name: DOCUMENT_CHART_TAG, attributes: { id } });

/** The number of a stored chart id (`c3` → 3), or undefined for a temporary key. */
export const getDocumentChartNumber = (id: string): number | undefined => {
    const match = DOCUMENT_CHART_ID_RE.exec(id);
    return match ? Number(match[1]) : undefined;
};

/**
 * `unsupportedChart` and `unsupportedTag` are content from a newer release:
 * shown as a placeholder and written back unchanged.
 */
export type DocumentChartBlock =
    | { type: 'markdown'; markdown: string }
    | { type: 'chart'; id: string; chart: DocumentChartContent }
    | { type: 'unsupportedChart'; id: string; raw: unknown }
    | { type: 'unsupportedTag'; line: string }
    /**
     * A link to a saved chart. Stored links carry `uuid`; input and content
     * as code may carry `slug` instead. Other attributes, such as `title`,
     * are kept as written.
     */
    | {
          type: 'savedChart';
          kind: DocumentSavedChartKind;
          attributes: Record<string, string>;
      };

/**
 * The Document in reading order. Chart tags must reference an entry in
 * `charts` or `unsupportedCharts`, once each.
 */
export const getDocumentChartBlocks = (
    content: DocumentContent,
): DocumentChartBlock[] => {
    const seen = new Set<string>();
    const unsupportedCharts = content.unsupportedCharts ?? {};
    return parseDocumentBlocks(content.markdown, isDocumentBlockTagName).map(
        (block): DocumentChartBlock => {
            if (block.type === 'markdown') return block;
            const savedChartKind = Object.hasOwn(
                SAVED_CHART_TAG_KINDS,
                block.tag.name,
            )
                ? SAVED_CHART_TAG_KINDS[block.tag.name]
                : undefined;
            if (savedChartKind) {
                const { uuid, slug } = block.tag.attributes;
                if (!uuid === !slug) {
                    throw new ParameterError(
                        `Every <${block.tag.name}> tag needs either a uuid or a slug`,
                    );
                }
                if (uuid && !isUuid(uuid)) {
                    throw new ParameterError(
                        `<${block.tag.name} uuid="${uuid}"> isn't a valid uuid`,
                    );
                }
                return {
                    type: 'savedChart',
                    kind: savedChartKind,
                    attributes: block.tag.attributes,
                };
            }
            if (block.tag.name !== DOCUMENT_CHART_TAG) {
                return {
                    type: 'unsupportedTag',
                    line: block.line ?? formatDocumentTag(block.tag),
                };
            }
            const { id } = block.tag.attributes;
            if (!id) {
                throw new ParameterError(
                    `Every <${DOCUMENT_CHART_TAG}> tag needs an id`,
                );
            }
            if (seen.has(id)) {
                throw new ParameterError(
                    `Chart "${id}" is placed more than once`,
                );
            }
            seen.add(id);
            if (Object.hasOwn(content.charts, id)) {
                return { type: 'chart', id, chart: content.charts[id] };
            }
            if (Object.hasOwn(unsupportedCharts, id)) {
                return {
                    type: 'unsupportedChart',
                    id,
                    raw: unsupportedCharts[id],
                };
            }
            throw new ParameterError(
                `Chart "${id}" is placed in the markdown but missing from charts`,
            );
        },
    );
};

const toMarkdownBlock = (block: DocumentChartBlock): DocumentBlock => {
    switch (block.type) {
        case 'markdown':
            return block;
        case 'unsupportedTag':
            return { type: 'markdown', markdown: block.line };
        case 'chart':
        case 'unsupportedChart':
            return {
                type: 'tag',
                tag: { name: DOCUMENT_CHART_TAG, attributes: { id: block.id } },
            };
        case 'savedChart':
            return {
                type: 'tag',
                tag: {
                    name: getSavedChartTagName(block.kind),
                    attributes: block.attributes,
                },
            };
        default:
            return assertUnreachable(block, 'Unknown Document block');
    }
};

/**
 * Canonical content: chart tags carry only their id, unplaced charts are
 * dropped, and `unsupportedCharts` is omitted when empty.
 */
export const fromDocumentChartBlocks = (
    blocks: DocumentChartBlock[],
): DocumentContent => {
    const unsupportedCharts = Object.fromEntries(
        blocks.flatMap((block) =>
            block.type === 'unsupportedChart' ? [[block.id, block.raw]] : [],
        ),
    );
    return {
        markdown: joinDocumentBlocks(blocks.map(toMarkdownBlock)),
        charts: Object.fromEntries(
            blocks.flatMap((block) =>
                block.type === 'chart' ? [[block.id, block.chart]] : [],
            ),
        ),
        ...(Object.keys(unsupportedCharts).length > 0
            ? { unsupportedCharts }
            : {}),
    };
};

export const mapDocumentCharts = (
    content: DocumentContent,
    map: (chart: DocumentChartContent, id: string) => DocumentChartContent,
): DocumentContent => ({
    ...content,
    charts: Object.fromEntries(
        Object.entries(content.charts).map(([id, chart]) => [
            id,
            map(chart, id),
        ]),
    ),
});

/**
 * Replace temporary chart keys with stored ids. Keys already shaped like
 * `c<n>` are kept; the others get the next free numbers in reading order, so
 * an id is never handed out twice for one Document.
 */
export const assignDocumentChartIds = (
    content: DocumentContent,
    nextChartNumber: number,
): { content: DocumentContent; nextChartNumber: number } => {
    const blocks = getDocumentChartBlocks(content);
    let next = Math.max(
        nextChartNumber,
        ...blocks.map((block) =>
            block.type === 'chart' || block.type === 'unsupportedChart'
                ? (getDocumentChartNumber(block.id) ?? 0) + 1
                : 1,
        ),
    );
    const assigned = blocks.map((block) => {
        if (
            block.type !== 'chart' ||
            getDocumentChartNumber(block.id) !== undefined
        ) {
            return block;
        }
        const id = `c${next}`;
        next += 1;
        return { ...block, id };
    });
    return {
        content: fromDocumentChartBlocks(assigned),
        nextChartNumber: next,
    };
};

export const getDocumentChartList = (
    content: DocumentContent,
): Array<{ id: string; chart: DocumentChartContent }> =>
    getDocumentChartBlocks(content).flatMap((block) =>
        block.type === 'chart' ? [{ id: block.id, chart: block.chart }] : [],
    );

const getChartTypeLabel = (content: DocumentChartContent): string => {
    if (content.source === 'sql') {
        return content.chart.chartKind;
    }
    const { chart } = content;
    if (chart.chartConfig.type !== ChartType.CARTESIAN) {
        return chart.chartConfig.type;
    }
    return chart.chartConfig.config?.eChartsConfig.series?.[0]?.type ?? 'bar';
};

/**
 * The Document with each chart tag expanded into a short description (id,
 * title, type, explore), for readers that should not receive full charts.
 */
export const getDocumentSummaryMarkdown = (content: DocumentContent): string =>
    joinDocumentBlocks(
        getDocumentChartBlocks(content).map((block): DocumentBlock => {
            if (block.type === 'markdown') return block;
            if (
                block.type === 'unsupportedTag' ||
                block.type === 'savedChart'
            ) {
                return toMarkdownBlock(block);
            }
            if (block.type === 'unsupportedChart') {
                return {
                    type: 'tag',
                    tag: {
                        name: DOCUMENT_CHART_TAG,
                        attributes: { id: block.id, unsupported: 'true' },
                    },
                };
            }
            const placed = block.chart;
            return {
                type: 'tag',
                tag: {
                    name: DOCUMENT_CHART_TAG,
                    attributes: {
                        id: block.id,
                        title: placed.chart.name,
                        type: getChartTypeLabel(placed),
                        ...(placed.source === 'sql'
                            ? { source: placed.source }
                            : { explore: placed.chart.tableName }),
                        ...(placed.source === 'merge'
                            ? { source: placed.source }
                            : {}),
                    },
                },
            };
        }),
    );

/** Tags an AI agent writes to place charts from its conversation. */
export const ARTIFACT_CHART_TAG = 'artifact-chart';
export const QUERY_RESULT_TAG = 'query-result';
export const DOCUMENT_CONVERSATION_TAGS = [
    ARTIFACT_CHART_TAG,
    QUERY_RESULT_TAG,
] as const;

/**
 * Give a temporary chart key the stored id of an identical, otherwise unplaced
 * chart in the previous version, so re-sending an unchanged chart under a
 * temporary key (e.g. re-uploading a file) does not copy it.
 */
export const matchDocumentChartKeys = (
    content: DocumentContent,
    previous: DocumentContent,
): DocumentContent => {
    const blocks = getDocumentChartBlocks(content);
    const used = new Set(
        blocks.flatMap((block) =>
            block.type === 'chart' &&
            getDocumentChartNumber(block.id) !== undefined
                ? [block.id]
                : [],
        ),
    );
    return fromDocumentChartBlocks(
        blocks.map((block) => {
            if (
                block.type !== 'chart' ||
                getDocumentChartNumber(block.id) !== undefined
            ) {
                return block;
            }
            const match = Object.entries(previous.charts).find(
                ([id, chart]) => !used.has(id) && isEqual(chart, block.chart),
            );
            if (!match) return block;
            used.add(match[0]);
            return { ...block, id: match[0] };
        }),
    );
};

/** The saved charts a Document links to, in reading order. */
export const getDocumentSavedChartLinks = (
    content: DocumentContent,
): Array<Extract<DocumentChartBlock, { type: 'savedChart' }>> =>
    getDocumentChartBlocks(content).flatMap((block) =>
        block.type === 'savedChart' ? [block] : [],
    );

/** Rewrite each link's attributes, e.g. a slug to the uuid it resolves to. */
export const mapDocumentSavedChartLinks = (
    content: DocumentContent,
    map: (
        link: Extract<DocumentChartBlock, { type: 'savedChart' }>,
    ) => Record<string, string>,
): DocumentContent =>
    fromDocumentChartBlocks(
        getDocumentChartBlocks(content).map((block) =>
            block.type === 'savedChart'
                ? { ...block, attributes: map(block) }
                : block,
        ),
    );
