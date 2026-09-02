import { type DataAppTemplate } from '@lightdash/common';

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
- The report must offer a visible Download PDF button — the app is incomplete without it, on this build and after any later edit. It uses the pre-installed \`html-to-image\` and \`jspdf\` packages to save the rendered report directly from the browser. Track an exporting state, disable the button while data or PDF generation is loading, and show a spinner or "Exporting..." label.
- Set \`@page { margin: 0; size: A4 }\` so the design fills the sheet edge-to-edge — apply your own padding inside each page (e.g. \`p-12\`) instead of relying on the browser's default page margin (which is ugly and shrinks the canvas).
- Use a clean, document-style typography hierarchy (title, section headings, body).
- Render charts at fixed widths so they reflow across pages cleanly.
- The app itself stays fully interactive (hover tooltips, the "Filter by <value>" action menu, etc.) — keep all of it. But the *exported* PDF is static: readers of the printed page can't hover, so any value only available via tooltip is lost. So **in addition to** the normal interactivity, draw the numbers on the chart: \`<LabelList>\` on bars, and labeled or end-of-line point labels on lines. Keep them legible — compact-format the numbers (e.g. \`1.2K\`, \`$1.3M\`) and avoid overlap on dense series.
- Include a title page header (title, subtitle, generated-on date) and section dividers.
- Apply CSS \`@media print\` rules and \`page-break-inside: avoid\` on cards and figures.
- Note: browsers may inject their own header/footer on printed pages (URL, page number, date), controlled by the user's print dialog — not removable via CSS. Keep critical content away from the very top and bottom edges so it doesn't sit underneath.
- \`window.print()\` can be a secondary Print action, but do not rely on it for the Download PDF button.
- Prefer narrative copy with charts as supporting evidence, not a dense dashboard grid.`;

// The viz build contract (the hook, the declaration, the option vocabulary, the
// final pass) lives in the sandbox's `reusable-visualization` skill, so it sits alongside
// the app-focused sandbox skill it overrides instead of competing with it from
// the user prompt. This prompt only orients the request and names that skill —
// naming it is enough for the agent to load it through the skill mechanism.
const DATA_APP_VIZ_INSTRUCTIONS = `[Data app viz]
You are building ONE reusable chart component. You do NOT fetch data or run queries: Lightdash runs the query, then gives you the result rows plus a mapping from your field names to the columns in those rows. The same component is reused across many different queries, so never hardcode column names — just render whatever data you are handed.

Before you write any code, use the \`reusable-visualization\` skill. It is the contract for this build: the \`useVizContext()\` hook you take your data and settings from, the fields and config options you declare as structured output, the exact option vocabulary, the palette rule, and the final pass you run before you finish. Where it and the sandbox skill disagree, it wins. Follow it as written.

Build the chart type the user asked for; only if they did not name one, pick what best fits the fields (bars to compare categories, a line for a trend over time).

Wire the standard data-point action: when \`useVizContext().underlyingData.enabled\` is true, clicking a mark opens a small action menu with "View underlying data", which fetches \`underlyingData.get({ row, metric })\` and renders the rows in a dialog with a Download button. Keep the untransformed source row on every interactive datum so the click can reference it; skip the menu on marks that aggregate multiple rows. The \`reusable-visualization\` skill has the full contract.

You are done when the chart renders for real and the declaration you emit is the one that skill describes: every field and every config option the component reads, and nothing a viewer would plausibly want different left hardcoded.`;

const FORECASTER_INSTRUCTIONS = `[Starter template: Forecaster]
Build a scenario-forecast app for one monthly metric:
- Query a monthly history series from the semantic layer: a month-grain time dimension plus the metric being forecast. When the user names a limit (committed spend, capacity, budget), bind it as a second "ceiling" metric and forecast against it.
- Derive defaults from the data, never hardcode them: fit a monthly growth rate to the history and derive a calendar-month seasonal index from the actuals.
- Offer scenario levers wired through \`useUrlState\` so every scenario is a shareable link: growth %, and a planned step change (which month it lands and its size - it raises the ceiling when one is bound, otherwise the value). Seed lever defaults from the fitted values and provide a reset-to-baseline control.
- Project 18-30 months ahead with a pure in-app function of history + levers, and always draw the scenario against the untouched baseline.
- Report outcomes fit for the binding: with a ceiling, months-until-limit and when the next step is needed (90% threshold); without one, projected run rate and the next-12-months total vs baseline.
- Chart: actuals first, then the projection in a visually distinct future zone, baseline dashed; ceiling and threshold lines when bound. Every axis gets a tickFormatter.
- Close with a copyable plain-text plan summary of the assumptions and the outcome.
- Every number traces to governed semantic-layer metrics: no hardcoded history, no invented data.`;

// Exhaustive by construction: a new DataAppTemplate value fails to compile
// until its instructions (or an explicit null, for free-form templates) are
// registered here.
const TEMPLATE_INSTRUCTIONS: Record<DataAppTemplate, string | null> = {
    dashboard: DASHBOARD_INSTRUCTIONS,
    slideshow: SLIDESHOW_INSTRUCTIONS,
    pdf: PDF_REPORT_INSTRUCTIONS,
    custom: null,
    data_app_viz: DATA_APP_VIZ_INSTRUCTIONS,
    forecaster: FORECASTER_INSTRUCTIONS,
};

export const getTemplateInstructions = (
    template: DataAppTemplate,
): string | null => TEMPLATE_INSTRUCTIONS[template];
