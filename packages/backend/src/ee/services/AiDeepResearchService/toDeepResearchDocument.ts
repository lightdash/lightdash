import {
    findDeepResearchChartRefs,
    getDocumentChartTag,
    type DocumentChartContent,
    type DocumentContent,
} from '@lightdash/common';

const MAX_DOCUMENT_NAME_CHARS = 255;
const FENCE_RE = /^(`{3,}|~{3,})/;
const CALLOUT_RE =
    /<(note|warning|info|tip)(?:\s+title="([^"]*)")?\s*>([\s\S]*?)<\/\1>/g;
const CALLOUT_LABELS: Record<string, string> = {
    note: 'Note',
    warning: 'Warning',
    info: 'Info',
    tip: 'Tip',
};

/** Applies `transform` to every line outside fenced code blocks. */
const mapProseLines = (
    markdown: string,
    transform: (line: string) => string,
): string => {
    let fence: string | null = null;
    return markdown
        .split('\n')
        .map((line) => {
            const fenceMatch = FENCE_RE.exec(line.trim());
            if (fence !== null) {
                if (fenceMatch && fenceMatch[1].startsWith(fence)) fence = null;
                return line;
            }
            if (fenceMatch) {
                [, fence] = fenceMatch;
                return line;
            }
            return transform(line);
        })
        .join('\n');
};

const toBlockquote = (title: string, body: string): string =>
    [`**${title}**`, '', ...body.trim().split('\n')]
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');

/** Report callouts become plain blockquotes, which every Document renders. */
const replaceCallouts = (markdown: string): string =>
    markdown.replace(
        CALLOUT_RE,
        (_match, tag: string, title: string | undefined, body: string) =>
            `\n${toBlockquote(title || CALLOUT_LABELS[tag], body)}\n`,
    );

/**
 * Takes the report's single `#` title as the Document name and promotes the
 * finding headings by one level, so each finding is a top-level section.
 */
const extractTitle = (
    markdown: string,
): { title: string | null; body: string } => {
    const lines = markdown.split('\n');
    const index = lines.findIndex((line) => line.trim() !== '');
    const match =
        index === -1 ? null : /^#\s+(.+?)\s*#*\s*$/.exec(lines[index]);
    if (!match) {
        return { title: null, body: markdown };
    }
    return {
        title: match[1].trim(),
        body: lines.slice(index + 1).join('\n'),
    };
};

const promoteHeadings = (markdown: string): string =>
    mapProseLines(markdown, (line) =>
        /^#{2,6}\s/.test(line) ? line.slice(1) : line,
    );

/**
 * Converts a finalized report into Document content. Every `<chart>` reference
 * must already be canonical; its chart is placed as a Document chart block.
 */
export const toDeepResearchDocument = ({
    markdown,
    charts,
    fallbackName,
}: {
    markdown: string;
    charts: ReadonlyMap<string, DocumentChartContent>;
    fallbackName: string;
}): { name: string; content: DocumentContent } => {
    const documentCharts: DocumentContent['charts'] = {};
    const placements = findDeepResearchChartRefs(markdown).map((ref) => {
        const chart = charts.get(ref.key);
        if (!chart) return { ref, block: '' };
        const id = `chart-${Object.keys(documentCharts).length + 1}`;
        documentCharts[id] = chart;
        return { ref, block: `\n\n${getDocumentChartTag(id)}\n\n` };
    });
    const withChartBlocks = placements.reduceRight(
        (current, { ref, block }) =>
            `${current.slice(0, ref.start)}${block}${current.slice(ref.end)}`,
        markdown,
    );
    const { title, body } = extractTitle(withChartBlocks);
    const documentMarkdown = promoteHeadings(replaceCallouts(body))
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return {
        name: (title || fallbackName).trim().slice(0, MAX_DOCUMENT_NAME_CHARS),
        content: { markdown: documentMarkdown, charts: documentCharts },
    };
};
