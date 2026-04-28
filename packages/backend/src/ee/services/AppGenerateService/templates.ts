import { assertUnreachable, type DataAppTemplate } from '@lightdash/common';

const DASHBOARD_INSTRUCTIONS = `[Starter template: Dashboard]
Build a single-page dashboard layout:
- Use a CSS grid layout with 2–4 columns of cards (assume a desktop viewport).
- Place the most important KPI tiles (single big-number cards) at the top of the page.
- Below the KPI row, render charts in a grid; group related metrics together.
- Include a clear page title and a short subtitle/description at the top.
- Keep card titles concise. Avoid long paragraphs of body copy.
- Default to a dense, scannable layout.`;

const SLIDESHOW_INSTRUCTIONS = `[Starter template: Slide Show]
Build a slideshow-style data app:
- Render one slide at a time, occupying the full viewport.
- Each slide focuses on a single chart or insight, with a headline and a short caption.
- Provide previous/next navigation (buttons and keyboard arrow keys) and a slide counter.
- Open with a title slide and close with a summary slide.
- Use large typography suitable for presenting on a screen.`;

const PDF_REPORT_INSTRUCTIONS = `[Starter template: PDF Report]
Build a print-optimized report:
- Layout for A4/Letter portrait pages with comfortable margins.
- Use a clean, document-style typography hierarchy (title, section headings, body).
- Render charts at fixed widths so they reflow across pages cleanly.
- Include a title page header (title, subtitle, generated-on date) and section dividers.
- Apply CSS \`@media print\` rules and \`page-break-inside: avoid\` on cards and figures.
- Prefer narrative copy with charts as supporting evidence, not a dense dashboard grid.`;

export const getTemplateInstructions = (
    template: DataAppTemplate,
): string | null => {
    switch (template) {
        case 'dashboard':
            return DASHBOARD_INSTRUCTIONS;
        case 'slideshow':
            return SLIDESHOW_INSTRUCTIONS;
        case 'pdf':
            return PDF_REPORT_INSTRUCTIONS;
        case 'custom':
            return null;
        default:
            return assertUnreachable(
                template,
                `Unknown data app template: ${template}`,
            );
    }
};
