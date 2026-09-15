// Runs from the hosted runtime stored Slack markup, where *text* is bold.
// Markdown reads single asterisks as italics, so upgrade them for display.
export const toRunSummaryMarkdown = (summary: string): string =>
    summary.includes('**')
        ? summary
        : summary.replace(
              /(^|[\s("'>])\*(?=\S)([^*\n]*?\S)\*(?=[\s).,:;!?"']|$)/gm,
              '$1**$2**',
          );
