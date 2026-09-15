// Runs from the hosted runtime stored Slack markup, where *text* is bold.
// Markdown reads single asterisks as italics, so upgrade them for display.
export const toRunSummaryMarkdown = (summary: string): string =>
    summary.includes('**')
        ? summary
        : summary.replace(
              /(^|[\s("'>])\*(?=\S)([^*\n]*?\S)\*(?=[\s).,:;!?"']|$)/gm,
              '$1**$2**',
          );

const TITLE_LINE = /^(\*\*[^*\n]+\*\*|\*[^*\n]+\*)$/;

// Reports name charts and dashboards in backticks; only snake_case stays code.
const quoteNamedContent = (markdown: string): string =>
    markdown.replace(/`([^`\n]+)`/g, (match, inner: string) =>
        /\s/.test(inner) && !inner.includes('_') ? `“${inner}”` : match,
    );

// The run row already names the run, so the report's title line is dropped.
// The lead paragraph stands alone until the reader opens the full report.
export const splitRunSummary = (
    summary: string,
): { lead: string; full: string } => {
    const paragraphs = quoteNamedContent(toRunSummaryMarkdown(summary))
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
    const body =
        paragraphs[0] !== undefined && TITLE_LINE.test(paragraphs[0])
            ? paragraphs.slice(1)
            : paragraphs;
    const full = body.join('\n\n');
    return { lead: body[0] ?? full, full };
};

// Row previews show the first lines of a markdown message as plain prose.
export const toPlainPreview = (markdown: string): string =>
    markdown
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,:;!?]|$)/g, '$1$2')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
