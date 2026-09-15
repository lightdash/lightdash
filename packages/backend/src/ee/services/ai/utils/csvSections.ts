import { AI_DEFAULT_MAX_QUERY_LIMIT } from '@lightdash/common';
import { truncateCsvAtRowBoundary } from './truncation';

export const MAX_ROWS_PER_CHART = AI_DEFAULT_MAX_QUERY_LIMIT;
// Rough character proxy for the model's context window; keeps a one-shot
// prompt well under provider token limits even for wide tables.
export const MAX_CONTENT_CHARS = 300_000;

/**
 * Accumulates per-chart CSV sections under a shared char budget so a single
 * oversized chart can't crowd every other one out of the prompt.
 */
export type SectionAccumulator = {
    parts: string[];
    remainingChars: number;
    omittedCharts: string[];
};

export const emptySectionAccumulator = (): SectionAccumulator => ({
    parts: [],
    remainingChars: MAX_CONTENT_CHARS,
    omittedCharts: [],
});

export const appendCsvSection = (
    acc: SectionAccumulator,
    title: string | null,
    csv: string,
    rowsTruncated: boolean,
    /** Extra lines between the heading and the CSV, e.g. a field legend. */
    preamble: string = '',
): SectionAccumulator => {
    const heading = `${title === null ? '' : `## ${title}\n`}${preamble}`;
    const available = acc.remainingChars - heading.length;
    const charsTruncated = csv.length > available;
    const body = charsTruncated
        ? truncateCsvAtRowBoundary(csv, available)
        : csv;
    const note =
        charsTruncated || rowsTruncated
            ? '\n[Data truncated — only part of the rows are included]'
            : '';
    const section = `${heading}${body}${note}`;
    return {
        parts: [...acc.parts, section],
        remainingChars: acc.remainingChars - section.length,
        omittedCharts: acc.omittedCharts,
    };
};

export const omitSection = (
    acc: SectionAccumulator,
    title: string,
): SectionAccumulator => ({
    ...acc,
    omittedCharts: [...acc.omittedCharts, title],
});

export const serializeSections = (acc: SectionAccumulator): string =>
    [
        ...acc.parts,
        ...(acc.omittedCharts.length > 0
            ? [
                  `[Charts omitted because the data exceeds the size limit: ${acc.omittedCharts.join(
                      ', ',
                  )}]`,
              ]
            : []),
    ].join('\n\n');
