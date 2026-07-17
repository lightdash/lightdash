import { z } from 'zod';
import { getErrorMessage } from '../../types/errors';
import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type ItemsMap,
    type Metric,
} from '../../types/field';
import { type MetricQuery } from '../../types/metricQuery';
import {
    AI_DEEP_RESEARCH_CONFIDENCE_LEVELS,
    type AiDeepResearchChartConfig,
} from './types';

export const AI_DEEP_RESEARCH_CHART_LANGUAGE = 'chart';
export const AI_DEEP_RESEARCH_MAX_CHARTS = 8;
export const AI_DEEP_RESEARCH_MAX_INLINE_ROWS = 100;
export const AI_DEEP_RESEARCH_MAX_INLINE_COLUMNS = 10;

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
    // Grouped charts need a pivoted execution; snapshots are unpivoted.
    if (chartConfig.groupBy?.length) {
        context.addIssue({
            code: 'custom',
            path: ['chartConfig', 'groupBy'],
            message:
                'groupBy is not supported in report charts; set it to null and use a separate chart per breakdown instead.',
        });
    }
};

const inlineValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
]);

export const aiDeepResearchInlineColumnSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean', 'date']),
});

/**
 * A chart backed by a completed run_metric_query execution. The backend
 * verifies the queryUuid and injects the snapshot at publish time.
 */
const warehouseChartObjectSchema = z.object({
    source: z.literal('warehouse'),
    queryUuid: z.string().uuid(),
    title: z.string().min(1),
    chartConfig: chartConfigSchema,
});

/**
 * A chart whose data the agent computed itself (derived analysis, MCP or
 * web data). Snapshot-only; `derivedFrom` cites the verified executions
 * the computation used, when any.
 */
const inlineChartObjectSchema = z.object({
    source: z.literal('inline'),
    key: z
        .string()
        .regex(
            /^[a-z0-9][a-z0-9-]{1,47}$/,
            'must be a short lowercase slug (letters, numbers, hyphens)',
        ),
    title: z.string().min(1),
    chartConfig: chartConfigSchema,
    columns: z
        .array(aiDeepResearchInlineColumnSchema)
        .min(1)
        .max(AI_DEEP_RESEARCH_MAX_INLINE_COLUMNS),
    rows: z
        .array(z.array(inlineValueSchema))
        .min(1)
        .max(AI_DEEP_RESEARCH_MAX_INLINE_ROWS),
    derivedFrom: z.array(z.string().uuid()).optional(),
});

export const aiDeepResearchChartDefinitionSchema = z
    .discriminatedUnion('source', [
        warehouseChartObjectSchema,
        inlineChartObjectSchema,
    ])
    .superRefine((chart, context) => {
        rejectGroupBy(chart.chartConfig, context);
        if (chart.source === 'inline') {
            chart.rows.forEach((row, rowIndex) => {
                if (row.length !== chart.columns.length) {
                    context.addIssue({
                        code: 'custom',
                        path: ['rows', rowIndex],
                        message: `row ${rowIndex + 1} has ${row.length} values but there are ${chart.columns.length} columns`,
                    });
                }
            });
        }
    });

export type AiDeepResearchWarehouseChart = z.infer<
    typeof warehouseChartObjectSchema
>;
export type AiDeepResearchInlineChart = z.infer<typeof inlineChartObjectSchema>;
export type AiDeepResearchChartDefinition = z.infer<
    typeof aiDeepResearchChartDefinitionSchema
>;

export const getDeepResearchChartKey = (
    chart: AiDeepResearchChartDefinition,
): string => (chart.source === 'warehouse' ? chart.queryUuid : chart.key);

const INLINE_CHART_TABLE = 'inline';

/**
 * Synthesizes a fields map for an inline (agent-computed) chart so it renders
 * through the same pipeline as warehouse-backed charts: number columns become
 * metrics, everything else dimensions.
 */
export const buildInlineChartFields = (
    columns: AiDeepResearchInlineChart['columns'],
): ItemsMap =>
    Object.fromEntries(
        columns.map((column) => {
            const base = {
                name: column.id,
                label: column.label,
                table: INLINE_CHART_TABLE,
                tableLabel: '',
                sql: '',
                hidden: false,
            };
            if (column.type === 'number') {
                const metric: Metric = {
                    ...base,
                    fieldType: FieldType.METRIC,
                    type: MetricType.NUMBER,
                };
                return [column.id, metric];
            }
            const dimensionTypes: Record<string, DimensionType> = {
                date: DimensionType.DATE,
                boolean: DimensionType.BOOLEAN,
                string: DimensionType.STRING,
            };
            const dimensionType =
                dimensionTypes[column.type] ?? DimensionType.STRING;
            const dimension: Dimension = {
                ...base,
                fieldType: FieldType.DIMENSION,
                type: dimensionType,
            };
            return [column.id, dimension];
        }),
    );

/** Synthesizes a metric query describing an inline chart's embedded data. */
export const buildInlineChartMetricQuery = (
    chart: Pick<AiDeepResearchInlineChart, 'columns' | 'rows'>,
): MetricQuery => ({
    exploreName: INLINE_CHART_TABLE,
    dimensions: chart.columns
        .filter((column) => column.type !== 'number')
        .map((column) => column.id),
    metrics: chart.columns
        .filter((column) => column.type === 'number')
        .map((column) => column.id),
    filters: {},
    sorts: [],
    limit: chart.rows.length,
    tableCalculations: [],
    additionalMetrics: [],
});

// ---------------------------------------------------------------------------
// Chart references: charts appear in the markdown as plain links,
// [Title](#chart-<key>), resolved against the chart definitions.
// ---------------------------------------------------------------------------

const CHART_REF_RE = /\[([^\]\n]*)\]\(#chart-([A-Za-z0-9-]+)\)/g;

export type AiDeepResearchChartRef = {
    key: string;
    title: string;
    /** Char range of the whole link in the markdown. */
    start: number;
    end: number;
    raw: string;
};

export const getDeepResearchChartRefMarkdown = (
    title: string,
    key: string,
): string => `[${title}](#chart-${key})`;

// ---------------------------------------------------------------------------
// Legacy fenced ```chart blocks. Kept for the data migration that converts
// previously persisted reports to chart references; new reports never
// contain them (the lint rejects fences).
// ---------------------------------------------------------------------------

export const legacyDeepResearchChartBlockSchema = z.object({
    queryUuid: z.string().uuid(),
    title: z.string().min(1),
    chartConfig: chartConfigSchema,
});

export type LegacyAiDeepResearchChartBlock = z.infer<
    typeof legacyDeepResearchChartBlockSchema
>;

export type AiDeepResearchChartBlockMatch = {
    start: number;
    end: number;
    raw: string;
    block: LegacyAiDeepResearchChartBlock | null;
    error: string | null;
};

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

const toChartBlockMatch = (
    markdown: string,
    { start, end, body }: FencedBlock,
): AiDeepResearchChartBlockMatch => {
    const raw = markdown.slice(start, end);
    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(body);
    } catch (e) {
        return {
            start,
            end,
            raw,
            block: null,
            error: `Chart block is not valid JSON: ${getErrorMessage(e)}`,
        };
    }
    const result = legacyDeepResearchChartBlockSchema.safeParse(parsedJson);
    if (!result.success) {
        return {
            start,
            end,
            raw,
            block: null,
            error: result.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join('; '),
        };
    }
    return { start, end, raw, block: result.data, error: null };
};

export const findDeepResearchChartBlocks = (
    markdown: string,
): AiDeepResearchChartBlockMatch[] =>
    scanFencedBlocks(markdown)
        .filter((block) => block.lang === AI_DEEP_RESEARCH_CHART_LANGUAGE)
        .map((block) => toChartBlockMatch(markdown, block));

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

export const findDeepResearchChartRefs = (
    markdown: string,
): AiDeepResearchChartRef[] => {
    const masked = maskFencedBlocks(markdown);
    const refs: AiDeepResearchChartRef[] = [];
    for (
        let match = CHART_REF_RE.exec(masked);
        match !== null;
        match = CHART_REF_RE.exec(masked)
    ) {
        refs.push({
            key: match[2],
            title: match[1],
            start: match.index,
            end: match.index + match[0].length,
            raw: markdown.slice(match.index, match.index + match[0].length),
        });
    }
    return refs;
};

const CONFIDENCE_TAG_RE = /<confidence\b[^>]*>/g;

export const countDeepResearchFindings = (markdown: string): number =>
    maskFencedBlocks(markdown).match(CONFIDENCE_TAG_RE)?.length ?? 0;

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

const lintHtmlTags = (masked: string): string[] => {
    const errors: string[] = [];
    const allowedTags = new Set([
        ...Object.keys(AI_DEEP_RESEARCH_MARKDOWN_TAGS),
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
        } else if (name !== 'br') {
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
 * Validates a submitted report: the markdown structure and the referential
 * integrity between chart definitions (tool arguments) and the
 * [title](#chart-key) references in the markdown. Returns actionable errors
 * the agent can self-correct from.
 */
export const lintDeepResearchReport = (
    markdown: string,
    charts: AiDeepResearchChartDefinition[],
): string[] => {
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

    // Charts are tool arguments referenced by [title](#chart-<key>) links;
    // fenced ```chart blocks are the legacy form and are rejected.
    if (findDeepResearchChartBlocks(markdown).length > 0) {
        errors.push(
            'Do not embed ```chart code fences in the markdown; define charts in the `charts` argument and reference each one inline with a [Chart title](#chart-<key>) link.',
        );
    }

    if (charts.length > AI_DEEP_RESEARCH_MAX_CHARTS) {
        errors.push(
            `The report defines ${charts.length} charts; use at most ${AI_DEEP_RESEARCH_MAX_CHARTS}.`,
        );
    }

    const keyCounts = new Map<string, number>();
    charts.forEach((chart) => {
        const key = getDeepResearchChartKey(chart);
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    });
    keyCounts.forEach((count, key) => {
        if (count > 1) {
            errors.push(
                `Chart key ${key} is defined ${count} times; every chart needs a unique queryUuid or key.`,
            );
        }
    });

    const refs = findDeepResearchChartRefs(markdown);
    const refCounts = new Map<string, number>();
    refs.forEach((ref) => {
        refCounts.set(ref.key, (refCounts.get(ref.key) ?? 0) + 1);
    });

    keyCounts.forEach((_, key) => {
        const refCount = refCounts.get(key) ?? 0;
        if (refCount !== 1) {
            errors.push(
                `Chart ${key} must be referenced exactly once in the markdown as [Chart title](#chart-${key}) (found ${refCount} references).`,
            );
        }
    });
    refCounts.forEach((_, key) => {
        if (!keyCounts.has(key)) {
            errors.push(
                `The markdown references chart ${key} but no chart with that key is defined in the charts argument.`,
            );
        }
    });

    findingSections.forEach(({ title, start, end }) => {
        const refsInSection = refs.filter(
            (ref) => ref.start >= start && ref.start < end,
        ).length;
        if (refsInSection > 1) {
            errors.push(
                `Finding section "${title}" references ${refsInSection} charts; reference at most one chart per finding and split additional charts into their own finding sections.`,
            );
        }
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
