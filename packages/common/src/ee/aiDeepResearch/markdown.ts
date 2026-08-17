import { z } from 'zod';
import { type AiDeepResearchChartConfig } from './types';

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

export const aiDeepResearchChartDefinitionSchema = warehouseChartObjectSchema;

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

export type AiDeepResearchReportAdjustment = {
    repaired: string[];
    dropped: Array<{
        key: string;
        reason: 'malformed' | 'unknown_chart' | 'duplicate' | 'unverifiable';
    }>;
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
export const applyDeepResearchChartRefsWithAdjustments = (
    markdown: string,
    published: ReadonlyMap<string, { title: string; description: string }>,
    options: {
        knownKeys?: ReadonlySet<string>;
        unverifiableKeys?: ReadonlySet<string>;
    } = {},
): { markdown: string; adjustments: AiDeepResearchReportAdjustment } => {
    const seen = new Set<string>();
    const adjustments: AiDeepResearchReportAdjustment = {
        repaired: [],
        dropped: [],
    };
    const result = spliceDeepResearchRanges(
        markdown,
        findDeepResearchChartTags(markdown).map((tag) => {
            const chart = tag.ref ? published.get(tag.ref.key) : undefined;
            if (!tag.ref) {
                adjustments.dropped.push({ key: '', reason: 'malformed' });
                return { match: tag, replacement: '' };
            }
            if (seen.has(tag.ref.key)) {
                adjustments.dropped.push({
                    key: tag.ref.key,
                    reason: 'duplicate',
                });
                return { match: tag, replacement: '' };
            }
            seen.add(tag.ref.key);
            if (!chart) {
                const isUnverifiable =
                    options.unverifiableKeys?.has(tag.ref.key) ||
                    options.knownKeys?.has(tag.ref.key);
                adjustments.dropped.push({
                    key: tag.ref.key,
                    reason: isUnverifiable ? 'unverifiable' : 'unknown_chart',
                });
                return { match: tag, replacement: '' };
            }
            if (
                tag.ref.title !== chart.title ||
                tag.ref.description !== chart.description
            ) {
                adjustments.repaired.push(tag.ref.key);
            }
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
    return { markdown: result, adjustments };
};

export const applyDeepResearchChartRefs = (
    markdown: string,
    published: ReadonlyMap<string, { title: string; description: string }>,
): string =>
    applyDeepResearchChartRefsWithAdjustments(markdown, published).markdown;

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

const STRUCTURAL_SECTIONS = new Set([
    'conclusion',
    'sources',
    'references',
    'caveats',
]);
const REPORT_TITLE_MAX_CHARS = 60;
const REPORT_TITLE_MIN_WORDS = 3;
const REPORT_TITLE_MAX_WORDS = 8;
const FINDING_TITLE_MAX_CHARS = 50;
const FINDING_TITLE_MAX_WORDS = 6;

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

const getSectionContent = (
    markdown: string,
    section: MarkdownSection,
): string => {
    const sectionMarkdown = markdown.slice(section.start, section.end);
    const firstNewline = sectionMarkdown.indexOf('\n');
    return firstNewline === -1 ? '' : sectionMarkdown.slice(firstNewline + 1);
};

const getWordCount = (value: string): number =>
    value.trim().split(/\s+/).filter(Boolean).length;

const isSupportedReportTitlePrefix = (prefix: string): boolean =>
    /^(?:\s*<warning title="Report adjusted">[\s\S]*?<\/warning>)?\s*$/.test(
        prefix,
    );

const getReportHeader = (
    preamble: string,
    titleLineIndex?: number,
): { title: string | null; introductionMarkdown: string } => {
    const lines = preamble.split('\n');
    const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
    const reportTitleLine = titleLineIndex ?? firstContentLine;
    const titleMatch =
        reportTitleLine === -1
            ? null
            : lines[reportTitleLine].match(/^# +(.+?)\s*$/);

    if (!titleMatch) {
        return { title: null, introductionMarkdown: preamble.trim() };
    }

    return {
        title: titleMatch[1].trim(),
        introductionMarkdown: lines
            .filter((_line, index) => index !== reportTitleLine)
            .join('\n')
            .trim(),
    };
};

const getNarrativeMarkdown = (content: string): string =>
    spliceDeepResearchRanges(
        content,
        findDeepResearchChartTags(content).map((tag) => ({
            match: tag,
            replacement: '',
        })),
    ).trim();

const getParagraphCount = (markdown: string): number =>
    markdown
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean).length;

export type ParsedDeepResearchFinding = {
    title: string;
    evidenceQueryUuid: string | null;
    interpretationMarkdown: string;
};

export type ParsedDeepResearchReport = {
    title: string;
    introductionMarkdown: string;
    findings: ParsedDeepResearchFinding[];
    conclusionMarkdown: string;
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
    const { title: reportTitle, introductionMarkdown } =
        getReportHeader(preamble);

    if (!reportTitle) {
        errors.push(
            'Start the report with a short "# " title before the introduction.',
        );
    } else {
        const titleWords = getWordCount(reportTitle);
        if (
            reportTitle.length > REPORT_TITLE_MAX_CHARS ||
            titleWords < REPORT_TITLE_MIN_WORDS ||
            titleWords > REPORT_TITLE_MAX_WORDS
        ) {
            errors.push(
                `The report title must be ${REPORT_TITLE_MIN_WORDS}-${REPORT_TITLE_MAX_WORDS} words and at most ${REPORT_TITLE_MAX_CHARS} characters.`,
            );
        }
    }

    if (!/\S/.test(introductionMarkdown)) {
        errors.push(
            'Write a short introduction after the report title and before the first "## " heading.',
        );
    }

    const findingSections = sections.filter(
        ({ title }) => !STRUCTURAL_SECTIONS.has(title.trim().toLowerCase()),
    );
    if (findingSections.length < 2 || findingSections.length > 5) {
        errors.push(
            `The report must contain 2-5 "## " finding sections between the introduction and the conclusion (found ${findingSections.length}).`,
        );
    }
    const conclusionIndex = sections.findIndex(
        ({ title }) => title.trim().toLowerCase() === 'conclusion',
    );
    if (conclusionIndex === -1) {
        errors.push('The report must end with a "## Conclusion" section.');
    } else if (conclusionIndex !== sections.length - 1) {
        errors.push('"## Conclusion" must be the final section.');
    } else {
        const conclusionMarkdown = getSectionContent(
            markdown,
            sections[conclusionIndex],
        ).trim();
        const conclusionParagraphs = getParagraphCount(conclusionMarkdown);
        if (conclusionParagraphs !== 1) {
            errors.push(
                `"## Conclusion" must contain one concise paragraph (found ${conclusionParagraphs}).`,
            );
        }
    }

    for (const title of ['sources', 'references', 'caveats']) {
        if (
            sections.some(
                (section) => section.title.trim().toLowerCase() === title,
            )
        ) {
            errors.push(
                `Do not add a separate "## ${title[0].toUpperCase()}${title.slice(
                    1,
                )}" section; put caveats with their findings and use inline Markdown links for external sources.`,
            );
        }
    }

    findingSections.forEach(({ title, content }) => {
        if (
            title.length > FINDING_TITLE_MAX_CHARS ||
            getWordCount(title) > FINDING_TITLE_MAX_WORDS
        ) {
            errors.push(
                `Finding heading "${title}" must be at most ${FINDING_TITLE_MAX_WORDS} words and ${FINDING_TITLE_MAX_CHARS} characters.`,
            );
        }

        const chartRefs = findDeepResearchChartRefs(content);
        if (chartRefs.length > 1) {
            errors.push(
                `Finding section "${title}" may contain at most one chart reference (found ${chartRefs.length}).`,
            );
        }
        if (chartRefs[0]) {
            if (content.slice(0, chartRefs[0].start).trim()) {
                errors.push(
                    `Finding section "${title}" must put its chart immediately after the heading and before the narrative.`,
                );
            }
        }

        const narrativeMarkdown = getNarrativeMarkdown(content);
        const paragraphCount = getParagraphCount(narrativeMarkdown);
        if (paragraphCount < 1 || paragraphCount > 2) {
            errors.push(
                `Finding section "${title}" must contain 1-2 narrative paragraphs after its chart (found ${paragraphCount}).`,
            );
        }
    });

    errors.push(...lintHtmlTags(masked));

    if (/\[\d+\]/.test(masked)) {
        errors.push(
            'Do not use numbered citation markers or a separate references list; link external evidence inline with normal Markdown links.',
        );
    }

    return errors;
};

/**
 * Builds a transient render model from the canonical report Markdown. Returning
 * null lets structurally malformed model output fall back to the plain Markdown
 * renderer. Editorial lint is intentionally stricter than parsing: a long
 * heading or extra paragraph should not discard an otherwise usable report.
 */
export const parseDeepResearchReport = (
    markdown: string,
): ParsedDeepResearchReport | null => {
    const maskedMarkdown = maskFencedBlocks(markdown);
    const { preamble: maskedPreamble, sections } =
        splitSections(maskedMarkdown);
    const reportTitleLine = maskedPreamble
        .split('\n')
        .findIndex((line) => /^# +(.+?)\s*$/.test(line));
    const preamble = markdown.slice(0, maskedPreamble.length);
    const reportTitlePrefix = preamble
        .split('\n')
        .slice(0, reportTitleLine)
        .join('\n');
    const { title: reportTitle, introductionMarkdown } = getReportHeader(
        preamble,
        isSupportedReportTitlePrefix(reportTitlePrefix) ? reportTitleLine : -1,
    );
    const conclusionIndex = sections.findIndex(
        ({ title }) => title.trim().toLowerCase() === 'conclusion',
    );
    const findingSections = sections.slice(0, conclusionIndex);
    const hasStructuralFinding = findingSections.some(({ title }) =>
        STRUCTURAL_SECTIONS.has(title.trim().toLowerCase()),
    );
    if (
        !reportTitle ||
        !introductionMarkdown ||
        conclusionIndex === -1 ||
        conclusionIndex !== sections.length - 1 ||
        findingSections.length < 2 ||
        findingSections.length > 5 ||
        hasStructuralFinding
    ) {
        return null;
    }

    const chartRefs = findDeepResearchChartRefs(markdown);
    const findings = findingSections.map((section) => {
        const content = getSectionContent(markdown, section);

        const contentStart =
            section.start +
            markdown.slice(section.start, section.end).indexOf('\n') +
            1;
        const chart = chartRefs.find(
            ({ start, end }) => start >= contentStart && end <= section.end,
        );

        return {
            title: section.title.trim(),
            evidenceQueryUuid: chart?.key ?? null,
            interpretationMarkdown: getNarrativeMarkdown(content),
        };
    });
    const conclusionMarkdown = getSectionContent(
        markdown,
        sections[conclusionIndex],
    ).trim();
    if (
        !conclusionMarkdown ||
        findings.some(({ interpretationMarkdown }) => !interpretationMarkdown)
    ) {
        return null;
    }

    return {
        title: reportTitle,
        introductionMarkdown,
        findings,
        conclusionMarkdown,
    };
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
