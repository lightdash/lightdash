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
- Layout for A4/Letter portrait pages with comfortable internal padding.
- Include a Download PDF button that uses the pre-installed \`html-to-image\` and \`jspdf\` packages to save the rendered report directly from the browser. Track an exporting state, disable the button while data or PDF generation is loading, and show a spinner or "Exporting..." label.
- Set \`@page { margin: 0; size: A4 }\` so the design fills the sheet edge-to-edge — apply your own padding inside each page (e.g. \`p-12\`) instead of relying on the browser's default page margin (which is ugly and shrinks the canvas).
- Use a clean, document-style typography hierarchy (title, section headings, body).
- Render charts at fixed widths so they reflow across pages cleanly.
- The app itself stays fully interactive (hover tooltips, the "Filter by <value>" action menu, etc.) — keep all of it. But the *exported* PDF is static: readers of the printed page can't hover, so any value only available via tooltip is lost. So **in addition to** the normal interactivity, draw the numbers on the chart: \`<LabelList>\` on bars, and labeled or end-of-line point labels on lines. Keep them legible — compact-format the numbers (e.g. \`1.2K\`, \`$1.3M\`) and avoid overlap on dense series.
- Include a title page header (title, subtitle, generated-on date) and section dividers.
- Apply CSS \`@media print\` rules and \`page-break-inside: avoid\` on cards and figures.
- Note: browsers may inject their own header/footer on printed pages (URL, page number, date), controlled by the user's print dialog — not removable via CSS. Keep critical content away from the very top and bottom edges so it doesn't sit underneath.
- \`window.print()\` can be a secondary Print action, but do not rely on it for the Download PDF button.
- Prefer narrative copy with charts as supporting evidence, not a dense dashboard grid.`;

const DATA_APP_VIZ_INSTRUCTIONS = `[Data app viz]
You are building a reusable **data app viz**, NOT a multi-panel app, and NOT a normal data app. A data app viz is data-agnostic: the HOST owns the query and pushes the already-fetched rows + a field mapping into your iframe. You are ONLY the renderer. Both numbered deliverables below are MANDATORY.

1. Render a SINGLE visualization (one chart) filling the available space. No dashboard, navigation, multiple panels, or page chrome.

2. Do NOT use the normal Lightdash app SDK / \`client\` to run queries, and do NOT hardcode field/column names. Receive your data over the postMessage bridge — the host sends exactly one message type you must listen for:

   window.addEventListener('message', (event) => {
     const data = event.data;
     if (!data || data.type !== 'lightdash:sdk:data-app-viz-context') return;
     const { fieldMapping, rows } = data;
     // fieldMapping: { [yourFieldName]: queryFieldId }
     // rows: Lightdash result rows. Each row is keyed by field id; each cell
     //       is { value: { raw, formatted } }.
     //   display string:  row[fieldId].value.formatted
     //   numeric value:   row[fieldId].value.raw
     // Re-render every time this fires (host re-sends on query/mapping change).
   });

   Resolve each declared field's query field id via \`fieldMapping[fieldName]\`, then read that field's cell from each row. Example for fields "category" (dimension) + "value" (metric):
     const catField = fieldMapping['category'];
     const valField = fieldMapping['value'];
     const data = rows.map((r) => ({
       label: r[catField]?.value?.formatted ?? '',
       value: Number(r[valField]?.value?.raw ?? 0),
     }));
   Render an empty/placeholder state before the first message arrives or when a field is unbound / rows are empty. Recharts, echarts, or plain SVG/HTML are all fine.

3. Declare the field schema for your renderer — the typed inputs it reads from \`fieldMapping\`. It is collected as the run's structured output (do NOT write a file); the host uses it to build the field mapping UI, so the viz is unusable without it. For each field:
   - \`name\` = the machine key your renderer reads from \`fieldMapping\` (unique, non-empty, no spaces) — must match the keys you used in step 2.
   - \`label\` = human label shown in the field mapping UI.
   - \`type\` = \`dimension\` (categorical/grouping), \`metric\` (numeric measure), or \`series\` (a dimension used to split/colour).
   - \`required\` = false only when the viz can render without that field.
   Declare exactly the fields your renderer reads — no more, no less. Example: a field "category" (type dimension, required) plus a field "value" (type metric, required).`;

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
        case 'data_app_viz':
            return DATA_APP_VIZ_INSTRUCTIONS;
        default:
            return assertUnreachable(
                template,
                `Unknown data app template: ${template}`,
            );
    }
};
