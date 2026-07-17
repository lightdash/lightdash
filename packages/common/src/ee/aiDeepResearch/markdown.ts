import { z } from 'zod';
import { getErrorMessage } from '../../types/errors';
import {
    AI_DEEP_RESEARCH_CONFIDENCE_LEVELS,
    type AiDeepResearchChartConfig,
} from './types';

export const AI_DEEP_RESEARCH_CHART_LANGUAGE = 'chart';
export const AI_DEEP_RESEARCH_MAX_CHARTS = 8;

/**
 * Whitelisted HTML tags allowed in report markdown, mapped to their allowed
 * attributes. Single source for the frontend sanitizer (streamdown
 * `allowedTags`) and the backend markdown lint.
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

export const aiDeepResearchChartBlockSchema = z
    .object({
        queryUuid: z.string().uuid(),
        /** Metadata only (accessibility, error messages) — not rendered. */
        title: z.string().min(1),
        chartConfig: chartConfigSchema,
    })
    .superRefine((block, context) => {
        // Grouped charts need a pivoted query execution, which report charts
        // do not have — they replay the exact preserved research query.
        if (block.chartConfig.groupBy?.length) {
            context.addIssue({
                code: 'custom',
                path: ['chartConfig', 'groupBy'],
                message:
                    'groupBy is not supported in report charts; set it to null and use a separate chart per breakdown instead.',
            });
        }
    });

export type AiDeepResearchChartBlock = z.infer<
    typeof aiDeepResearchChartBlockSchema
>;

export type AiDeepResearchChartBlockMatch = {
    /** Char offset of the opening fence line. */
    start: number;
    /** Char offset just past the closing fence line (or end of document). */
    end: number;
    raw: string;
    block: AiDeepResearchChartBlock | null;
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
    const result = aiDeepResearchChartBlockSchema.safeParse(parsedJson);
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

export const extractDeepResearchCharts = (
    markdown: string,
): AiDeepResearchChartBlock[] =>
    findDeepResearchChartBlocks(markdown).flatMap((match) =>
        match.block ? [match.block] : [],
    );

export const spliceDeepResearchChartBlocks = (
    markdown: string,
    replacements: Array<{
        match: Pick<AiDeepResearchChartBlockMatch, 'start' | 'end'>;
        replacement: string;
    }>,
): string =>
    [...replacements]
        .sort((a, b) => b.match.start - a.match.start)
        .reduce(
            (doc, { match, replacement }) =>
                `${doc.slice(0, match.start)}${replacement}\n${doc.slice(
                    match.end,
                )}`,
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

export const lintDeepResearchReportMarkdown = (markdown: string): string[] => {
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

    const chartMatches = findDeepResearchChartBlocks(markdown);
    chartMatches.forEach((match, index) => {
        if (match.error) {
            errors.push(`Chart block ${index + 1} is invalid: ${match.error}`);
        }
    });
    findingSections.forEach(({ title, start, end }) => {
        const chartsInSection = chartMatches.filter(
            (match) => match.start >= start && match.start < end,
        ).length;
        if (chartsInSection > 1) {
            errors.push(
                `Finding section "${title}" embeds ${chartsInSection} chart blocks; embed at most one chart per finding and split additional charts into their own finding sections.`,
            );
        }
    });
    if (chartMatches.length > AI_DEEP_RESEARCH_MAX_CHARTS) {
        errors.push(
            `The report contains ${chartMatches.length} chart blocks; use at most ${AI_DEEP_RESEARCH_MAX_CHARTS}.`,
        );
    }
    const seenQueryUuids = new Set<string>();
    chartMatches.forEach((match) => {
        if (!match.block) return;
        if (seenQueryUuids.has(match.block.queryUuid)) {
            errors.push(
                `Chart queryUuid ${match.block.queryUuid} is used by more than one chart block; each completed query may be embedded once.`,
            );
        }
        seenQueryUuids.add(match.block.queryUuid);
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
