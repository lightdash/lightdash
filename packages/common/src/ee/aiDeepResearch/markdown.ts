import { z } from 'zod';
import {
    AI_DEEP_RESEARCH_CONFIDENCE_LEVELS,
    type AiDeepResearchChartConfig,
} from './types';

export const AI_DEEP_RESEARCH_MAX_CHARTS = 8;
export const AI_DEEP_RESEARCH_MAX_CHART_DESCRIPTION_CHARS = 300;
export const AI_DEEP_RESEARCH_MAX_REPORT_MARKDOWN_CHARS = 60_000;

/**
 * Whitelisted HTML tags allowed in report markdown, mapped to their allowed
 * attributes. Single source for the frontend sanitizer and the backend
 * markdown lint.
 */
export const AI_DEEP_RESEARCH_MARKDOWN_TAGS: Record<string, string[]> = {
    note: ['title'],
    warning: ['title'],
    info: ['title'],
    tip: ['title'],
    confidence: ['level'],
};

const chartConfigSchema: z.ZodType<AiDeepResearchChartConfig> = z.object({
    defaultVizType: z.enum([
        'table',
        'bar',
        'horizontal',
        'line',
        'scatter',
        'pie',
        'funnel',
    ]),
    xAxisDimension: z.string().nullable(),
    yAxisMetrics: z.array(z.string()).nullable(),
    groupBy: z.array(z.string()).nullable(),
    xAxisType: z.enum(['category', 'time']).nullable(),
    stackBars: z.boolean().nullable(),
    lineType: z.enum(['line', 'area']).nullable(),
    funnelDataInput: z.enum(['row', 'column']).nullable(),
    xAxisLabel: z.string(),
    yAxisLabel: z.string(),
    secondaryYAxisMetric: z.string().nullable(),
    secondaryYAxisLabel: z.string().nullable(),
});

const rejectGroupBy = (
    chartConfig: AiDeepResearchChartConfig,
    context: z.RefinementCtx,
) => {
    // Grouped charts need a pivoted execution; report chart results are unpivoted.
    if (chartConfig.groupBy?.length) {
        context.addIssue({
            code: 'custom',
            path: ['chartConfig', 'groupBy'],
            message:
                'groupBy is not supported in report charts; set it to null and use a separate chart per breakdown instead.',
        });
    }
};

/**
 * A chart backed by a completed run_metric_query execution. Every report chart
 * is one of these: the backend verifies the queryUuid before using its metric
 * query for live execution, so a chart can never assert a query the run did not make.
 */
const warehouseChartObjectSchema = z.object({
    source: z.literal('warehouse'),
    queryUuid: z.string().uuid(),
    title: z.string().min(1),
    chartConfig: chartConfigSchema,
});

export const aiDeepResearchChartDefinitionSchema =
    warehouseChartObjectSchema.superRefine((chart, context) => {
        rejectGroupBy(chart.chartConfig, context);
    });

export type AiDeepResearchWarehouseChart = z.infer<
    typeof warehouseChartObjectSchema
>;
export type AiDeepResearchChartDefinition = z.infer<
    typeof aiDeepResearchChartDefinitionSchema
>;

// ---------------------------------------------------------------------------
// Chart references: chart data is stored separately, while the markdown keeps
// compact metadata that lets an LLM understand the chart without reading it.
// ---------------------------------------------------------------------------

const CHART_REF_RE = /<chart\b([^>]*)>/g;
const CHART_ATTRIBUTE_RE = /\b(id|title|description)="([^"]*)"/g;
const HTML_ENTITY_RE = /&(#x[\da-f]+|#\d+|amp|quot|lt|gt);/gi;
const NAMED_HTML_ENTITIES: Record<string, string> = {
    amp: '&',
    quot: '"',
    lt: '<',
    gt: '>',
};

const decodeHtmlEntities = (value: string): string =>
    value.replace(HTML_ENTITY_RE, (entity, code: string) => {
        const named = NAMED_HTML_ENTITIES[code.toLowerCase()];
        if (named) {
            return named;
        }
        const isHex = code.toLowerCase().startsWith('#x');
        const radix = isHex ? 16 : 10;
        const codePoint = Number.parseInt(code.slice(isHex ? 2 : 1), radix);
        return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : entity;
    });

const encodeHtmlAttribute = (value: string): string =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');

const escapeMarkdownLabel = (value: string): string =>
    value
        .replaceAll('\\', '\\\\')
        .replaceAll('[', '\\[')
        .replaceAll(']', '\\]');

export type AiDeepResearchChartRef = {
    key: string;
    title: string;
    description: string;
    /** Char range of the whole tag in the markdown. */
    start: number;
    end: number;
    raw: string;
};

/** Every `<chart>` tag in the markdown, whether or not it parses into a ref. */
type AiDeepResearchChartTag = {
    ref: AiDeepResearchChartRef | null;
    start: number;
    end: number;
};

export const getDeepResearchChartRefMarkdown = (
    title: string,
    key: string,
    description: string,
): string =>
    `<chart id="${encodeHtmlAttribute(key)}" title="${encodeHtmlAttribute(
        title,
    )}" description="${encodeHtmlAttribute(description)}">`;

type FencedBlock = {
    start: number;
    end: number;
    lang: string;
    body: string;
};

const parseFenceLine = (
    line: string,
): { marker: string; info: string } | null => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*(.*)$/);
    if (!match) return null;
    const [, marker, rest] = match;
    // CommonMark: a backtick fence's info string cannot contain backticks
    if (marker.startsWith('`') && rest.includes('`')) return null;
    return { marker, info: rest.trim() };
};

const scanFencedBlocks = (markdown: string): FencedBlock[] => {
    const blocks: FencedBlock[] = [];
    const lines = markdown.split('\n');
    let offset = 0;
    let open: {
        marker: string;
        lang: string;
        start: number;
        body: string[];
    } | null = null;

    for (const line of lines) {
        const lineEnd = Math.min(offset + line.length + 1, markdown.length);
        const fence = parseFenceLine(line);
        if (open) {
            const closes =
                fence !== null &&
                fence.info === '' &&
                fence.marker[0] === open.marker[0] &&
                fence.marker.length >= open.marker.length;
            if (closes) {
                blocks.push({
                    start: open.start,
                    end: lineEnd,
                    lang: open.lang,
                    body: open.body.join('\n'),
                });
                open = null;
            } else {
                open.body.push(line);
            }
        } else if (fence) {
            const lang = fence.info.split(/\s+/)[0] ?? '';
            open = { marker: fence.marker, lang, start: offset, body: [] };
        }
        offset += line.length + 1;
    }

    if (open) {
        blocks.push({
            start: open.start,
            end: markdown.length,
            lang: open.lang,
            body: open.body.join('\n'),
        });
    }

    return blocks;
};

/** Splices char ranges out of a markdown document, back to front. */
export const spliceDeepResearchRanges = (
    markdown: string,
    replacements: Array<{
        match: { start: number; end: number };
        replacement: string;
    }>,
): string =>
    [...replacements]
        .sort((a, b) => b.match.start - a.match.start)
        .reduce(
            (doc, { match, replacement }) =>
                `${doc.slice(0, match.start)}${replacement}${
                    match.end < doc.length && doc[match.end - 1] !== '\n'
                        ? ''
                        : '\n'
                }${doc.slice(match.end)}`,
            markdown,
        );

/** Replaces fenced code blocks with blank lines so tag/heading scans skip them. */
const maskFencedBlocks = (markdown: string): string => {
    const blocks = scanFencedBlocks(markdown);
    return blocks.reduceRight(
        (doc, { start, end }) =>
            `${doc.slice(0, start)}${doc
                .slice(start, end)
                .replace(/[^\n]/g, ' ')}${doc.slice(end)}`,
        markdown,
    );
};

/**
 * The id is the only attribute the model has to get right: it names an
 * execution the server already holds. Title and description are optional
 * because the server rewrites them from that execution at publish time.
 */
const findDeepResearchChartTags = (
    markdown: string,
): AiDeepResearchChartTag[] => {
    const masked = maskFencedBlocks(markdown);
    const tags: AiDeepResearchChartTag[] = [];
    for (
        let match = CHART_REF_RE.exec(masked);
        match !== null;
        match = CHART_REF_RE.exec(masked)
    ) {
        const attributes = Object.fromEntries(
            [...match[1].matchAll(CHART_ATTRIBUTE_RE)].map(
                ([, name, value]) => [name, decodeHtmlEntities(value)],
            ),
        );
        const start = match.index;
        const end = match.index + match[0].length;
        const { id } = attributes;
        tags.push({
            start,
            end,
            ref:
                id && /^[A-Za-z0-9-]+$/.test(id)
                    ? {
                          key: id,
                          title: attributes.title ?? '',
                          description: (attributes.description ?? '').slice(
                              0,
                              AI_DEEP_RESEARCH_MAX_CHART_DESCRIPTION_CHARS,
                          ),
                          start,
                          end,
                          raw: markdown.slice(start, end),
                      }
                    : null,
        });
    }
    return tags;
};

export const findDeepResearchChartRefs = (
    markdown: string,
): AiDeepResearchChartRef[] =>
    findDeepResearchChartTags(markdown).flatMap(({ ref }) =>
        ref ? [ref] : [],
    );

/**
 * Rewrites the markdown so it contains exactly the charts the server published:
 * each retained tag is replaced with its canonical form, and every other
 * `<chart>` tag — unknown id, unverifiable execution, duplicate, malformed — is
 * spliced out. A chart the server cannot back costs the report that chart,
 * never the narrative around it.
 */
export const applyDeepResearchChartRefs = (
    markdown: string,
    published: ReadonlyMap<string, { title: string; description: string }>,
): string => {
    const rendered = new Set<string>();
    return spliceDeepResearchRanges(
        markdown,
        findDeepResearchChartTags(markdown).map((tag) => {
            const chart = tag.ref ? published.get(tag.ref.key) : undefined;
            if (!tag.ref || !chart || rendered.has(tag.ref.key)) {
                return { match: tag, replacement: '' };
            }
            rendered.add(tag.ref.key);
            return {
                match: tag,
                replacement: getDeepResearchChartRefMarkdown(
                    chart.title,
                    tag.ref.key,
                    chart.description,
                ),
            };
        }),
    );
};

export const renderDeepResearchChartRefs = (markdown: string): string =>
    spliceDeepResearchRanges(
        markdown,
        findDeepResearchChartRefs(markdown).map((ref) => ({
            match: ref,
            replacement: `[${escapeMarkdownLabel(ref.title)}](#chart-${
                ref.key
            })`,
        })),
    );

const CONFIDENCE_TAG_RE = /<confidence\b[^>]*>/g;

const STRUCTURAL_SECTIONS = new Set(['conclusion', 'sources', 'caveats']);

type MarkdownSection = {
    title: string;
    content: string;
    /** Char range of the whole section (heading line to next heading). */
    start: number;
    end: number;
};

const splitSections = (
    masked: string,
): { preamble: string; sections: MarkdownSection[] } => {
    const lines = masked.split('\n');
    const sections: MarkdownSection[] = [];
    const preambleLines: string[] = [];
    let current: { title: string; lines: string[]; start: number } | null =
        null;
    let offset = 0;

    const closeCurrent = (end: number) => {
        if (current) {
            sections.push({
                title: current.title,
                content: current.lines.join('\n'),
                start: current.start,
                end,
            });
        }
    };

    for (const line of lines) {
        const heading = line.match(/^## +(.+?)\s*$/);
        if (heading) {
            closeCurrent(offset);
            current = { title: heading[1], lines: [], start: offset };
        } else if (current) {
            current.lines.push(line);
        } else {
            preambleLines.push(line);
        }
        offset += line.length + 1;
    }
    closeCurrent(masked.length);
    return { preamble: preambleLines.join('\n'), sections };
};

export const countDeepResearchFindings = (markdown: string): number =>
    splitSections(maskFencedBlocks(markdown)).sections.filter(
        ({ title }) => !STRUCTURAL_SECTIONS.has(title.trim().toLowerCase()),
    ).length;

const lintHtmlTags = (masked: string): string[] => {
    const errors: string[] = [];
    const allowedTags = new Set([
        ...Object.keys(AI_DEEP_RESEARCH_MARKDOWN_TAGS),
        'chart',
        'br',
    ]);
    const tagCounts = new Map<string, { open: number; close: number }>();
    const disallowed = new Set<string>();

    const tagRe = /<(\/?)([a-zA-Z][a-zA-Z-]*)(?=[\s/>])/g;
    for (
        let match = tagRe.exec(masked);
        match !== null;
        match = tagRe.exec(masked)
    ) {
        const [, slash, rawName] = match;
        const name = rawName.toLowerCase();
        if (!allowedTags.has(name)) {
            disallowed.add(rawName);
        } else if (name !== 'br' && name !== 'chart') {
            const counts = tagCounts.get(name) ?? { open: 0, close: 0 };
            if (slash) counts.close += 1;
            else counts.open += 1;
            tagCounts.set(name, counts);
        }
    }

    if (disallowed.size > 0) {
        errors.push(
            `Disallowed HTML tag(s): ${[...disallowed].join(
                ', ',
            )}. Only ${Object.keys(AI_DEEP_RESEARCH_MARKDOWN_TAGS)
                .map((tag) => `<${tag}>`)
                .join(', ')} are supported; any other HTML is stripped.`,
        );
    }

    tagCounts.forEach(({ open, close }, name) => {
        if (open !== close) {
            errors.push(
                `Unbalanced <${name}> tags: ${open} opening vs ${close} closing. Use paired tags (self-closing tags are not supported), e.g. <${name} ...>content</${name}>.`,
            );
        }
    });

    return errors;
};

/**
 * Validates the structure of a submitted report. Chart references are
 * deliberately not linted: the server owns them and drops the ones it cannot
 * back, so a chart problem can never cost the report.
 */
export const lintDeepResearchReport = (markdown: string): string[] => {
    const errors: string[] = [];
    const masked = maskFencedBlocks(markdown);
    const { preamble, sections } = splitSections(masked);

    if (!/\S/.test(preamble.replace(/^#{1,6} .*$/gm, ''))) {
        errors.push(
            'Start the report with a short introduction (2-4 sentences of prose) before the first "## " heading.',
        );
    }

    const findingSections = sections.filter(
        ({ title }) => !STRUCTURAL_SECTIONS.has(title.trim().toLowerCase()),
    );
    if (findingSections.length === 0) {
        errors.push(
            'The report must contain at least one "## " finding section between the introduction and the conclusion.',
        );
    }
    if (
        !sections.some(
            ({ title }) => title.trim().toLowerCase() === 'conclusion',
        )
    ) {
        errors.push('The report must end with a "## Conclusion" section.');
    }

    findingSections.forEach(({ title, content }) => {
        const confidenceTags = content.match(CONFIDENCE_TAG_RE) ?? [];
        if (confidenceTags.length !== 1) {
            errors.push(
                `Finding section "${title}" must contain exactly one <confidence level="low|medium|high">...</confidence> tag right after its heading (found ${confidenceTags.length}).`,
            );
        }
        confidenceTags.forEach((tag) => {
            const level = tag.match(/level="([^"]*)"/)?.[1];
            if (
                !AI_DEEP_RESEARCH_CONFIDENCE_LEVELS.includes(
                    level as (typeof AI_DEEP_RESEARCH_CONFIDENCE_LEVELS)[number],
                )
            ) {
                errors.push(
                    `Finding section "${title}" has a <confidence> tag with an invalid level; use level="low", "medium" or "high".`,
                );
            }
        });
    });

    errors.push(...lintHtmlTags(masked));

    const hasCitations = /\[\d+\]/.test(masked);
    const hasSourcesSection = sections.some(
        ({ title }) => title.trim().toLowerCase() === 'sources',
    );
    if (hasCitations && !hasSourcesSection) {
        errors.push(
            'The report uses [n] citation markers but has no "## Sources" section; list every cited source there as a numbered list.',
        );
    }

    return errors;
};

export const aiDeepResearchReportInputSchema = z.object({
    markdown: z.string().min(1).max(AI_DEEP_RESEARCH_MAX_REPORT_MARKDOWN_CHARS),
});

export const aiDeepResearchReportSchema =
    aiDeepResearchReportInputSchema.superRefine(({ markdown }, context) => {
        for (const message of lintDeepResearchReport(markdown)) {
            context.addIssue({
                code: 'custom',
                path: ['markdown'],
                message,
            });
        }
    });

export type AiDeepResearchSubmittedReport = z.infer<
    typeof aiDeepResearchReportSchema
>;
