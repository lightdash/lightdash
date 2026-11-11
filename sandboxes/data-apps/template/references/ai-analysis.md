# AI analysis (`useInsights`)

> Read this when the user wants an executive summary, "what changed and why", anomaly callouts, "flag anything unusual", or an "AI insight" block inside the app.

Lightdash analyses the queries the app ran for the viewer's current view and pushes the result into the app. The app **renders** that analysis and can trigger it; it never sends its own prompt, never calls a model provider, and never needs an API key. Do not wire an external connection to an LLM for this — the native hook is the supported path and respects the viewer's data permissions.

Two operations exist, both run by Lightdash:

- **Detect** — reads the results the app already loaded and returns a headline, a summary, a list of notable data points (anomalies) with the query, field and row they refer to, and the limitations of the data (no comparison period, truncation, and so on).
- **Investigate** — for one anomaly, an AI agent with read-only query tools looks for possible drivers using data beyond the page and returns a Markdown explanation with evidence and a confidence line. It runs asynchronously; the app shows progress from the pushed status.

## Default build

When the user asks for AI analysis, an executive summary, anomalies, "what changed", "flag anything unusual", or insights and gives no further detail, build **all** of this with the shipped components in `src/components/insights/` (never rewrite them):

1. `<InsightsSummary />` near the top of the page.
2. On every query-bound chart, `InsightMarker` as both `dot` and `activeDot` (lines/areas) or `insightCellProps` on each `Cell` (bars), one per series with its `dataKey` as `fieldId`, plus the finding text in the tooltip via `insightTooltipText`.
3. `<InvestigateMenuItem />` in every data-point action menu, next to "Filter by …" and "View underlying data".
4. `<InvestigationCard />` under the chart once an investigation starts.

Narrower asks build only that part: "just an executive summary" is step 1 alone; "mark anomalies on the charts" is steps 2 to 4. All four components render nothing when the host has no analysis to offer, so nothing else needs gating.

```tsx
import { useInsights, useLightdash } from '@lightdash/query-sdk';
import {
    InsightMarker,
    InsightsSummary,
    InvestigateMenuItem,
    InvestigationCard,
    insightTooltipText,
} from '@/components/insights';
```

## View-level: the executive summary block

`useInsights()` with no argument returns the analysis of the whole view:

```ts
const view = useInsights();
// view.status:      'idle' | 'analysing' | 'ready' | 'error' | 'unavailable'
// view.headline     one sentence with the main finding (ready only)
// view.summary      two to four sentences an executive can read without the charts
// view.limitations  string[] — what the data could not show
// view.dataAsOf     period the data covers, in words, or null
// view.generatedAt  ISO timestamp, or null
// view.stale        true when the view changed since the analysis ran
// view.anomalies    every notable data point (see below)
// view.error        message when status is 'error'
// view.analyse()    ask Lightdash to (re)run the analysis
```

Render `<InsightsSummary />` near the top of the page. It handles every status (idle, analysing, ready, error, stale) and renders nothing when unavailable. Props: `title`, `idleText`, `instructions`, `analyseOnLoad`, `className`. Write your own block only when the user asks for a layout the component cannot give, and then keep every status branch.

### Author instructions for the analysis

When the user wants the summary written a certain way — a language or locale ("British English", "amounts in EUR"), a tone, or a line or two of domain vocabulary the model would otherwise misread ("stage labels are covenant stages") — pass it as `instructions`:

```tsx
<InsightsSummary instructions="Write in British English. Amounts are EUR. 'Stage' labels are covenant stages, not sales stages." />
```

Or equivalently `useInsights({ instructions })` in a custom block. One string per app (the last value set wins), applied to every analysis of the app, max 2000 characters — keep it to a few short sentences. It guides wording and interpretation only; it cannot grant data access or change which rows are analysed. Do not restate what the data already shows, and do not set it unless the user asked for specific guidance.

The organization may also set default instructions in its settings; those apply first and the app's instructions are added after them, so keep app instructions to app-specific guidance (domain vocabulary) and leave org-wide style (language, currency) to the org default when the user says it should apply everywhere.

### Analyse on load

By default the analysis runs when the viewer clicks **Analyse**. When the user wants it to run on its own ("analyse as soon as it loads", "show the summary when the page opens"), set `analyseOnLoad`:

```tsx
<InsightsSummary analyseOnLoad />
```

Or equivalently `useInsights({ analyseOnLoad: true })` in a custom block. One value per app (the last value set wins). The host runs the analysis once the page's queries settle and again when the view changes; a stored analysis of the same rows is reused instead of re-run. Do not set it unless the user asked for it.

Rules for the block:

- Say "AI-generated" in the footer. Never name a model or provider.
- Show the limitations; they are what keeps the summary honest.
- Never mount it unconditionally in a modal or overlay; it is page content.
- `analyse()` re-runs even when a result exists (that is the Regenerate case). Do not call it in an effect on mount; the viewer clicks. Lightdash reuses a stored analysis of identical rows on open by itself.

## Per-chart: anomalies on the data points

`useInsights(result)` with a `useLightdash` result narrows to that chart:

```ts
const orders = useLightdash(ordersQuery);
const insights = useInsights(orders);
// insights.status           same as the view
// insights.anomalies        the anomalies that refer to this query
// insights.matches(row, fieldId?)  the anomalies on this row; fieldId narrows to one metric
// insights.canInvestigate   false when no agent is available
// insights.canContinue      false when the org keeps viewers at the explanation
// insights.investigate(id)  start an investigation of one anomaly
// insights.continueInAskAi(id)  open the investigation's thread in Ask AI
```

Each anomaly:

```ts
{
    id: string;
    severity: 'high' | 'medium' | 'positive' | 'info';
    text: string;                            // one or two sentences, names period and scope
    queryUuid: string;
    fieldId: string;                         // the metric it is about
    dimensionValues: Record<string, string>; // the row it refers to, by dimension field id
    expected: string | null;
    actual: string | null;
    investigation: {
        status: 'idle' | 'running' | 'ready' | 'error';
        explanation: string | null;          // Markdown, when ready
        partial: boolean;                    // true when the query budget ran out
        threadUuid: string | null;
        error: string | null;
    };
}
```

Mark the flagged rows with the shipped helpers. Only `high`, `medium` and `positive` earn a marker; `info` is context for the summary and is never painted. Every helper takes the series' `dataKey` as `fieldId`, so on a chart plotting revenue and orders a revenue anomaly marks only the revenue series. The marker element must be both `dot` and `activeDot`, otherwise the hover dot covers it and takes the click:

```tsx
import { Line, LineChart, Tooltip } from 'recharts';
import { ChartTooltipSurface } from '@/lib/floating';

function RevenueByMonth() {
    const revenue = useLightdash(revenueQuery);
    const insights = useInsights(revenue);
    const [menu, setMenu] = useState(null);
    const openMenu = (row, e, fieldId) =>
        setMenu({ row, fieldId, x: e.clientX, y: e.clientY });
    const dot = (
        <InsightMarker insights={insights} fieldId="revenue" onOpenMenu={openMenu} />
    );

    return (
        <LineChart data={revenue.data}>
            <Tooltip
                content={({ payload, label }) => {
                    const row = payload?.[0]?.payload;
                    const finding = insightTooltipText(insights, row, 'revenue');
                    return row ? (
                        <ChartTooltipSurface>
                            <div className="font-semibold">{label}</div>
                            <div>{revenue.format(row, 'revenue')}</div>
                            {finding && <div className="text-destructive text-xs">{finding}</div>}
                        </ChartTooltipSurface>
                    ) : null;
                }}
            />
            <Line dataKey="revenue" dot={dot} activeDot={dot} />
        </LineChart>
    );
}
```

Bar charts use `insightCellProps` on each `Cell` and open the menu from the bar's `onClick`:

```tsx
<Bar dataKey="revenue" onClick={(d, _i, e) => openMenu(d.payload, e, 'revenue')}>
    {rows.map((row) => (
        <Cell key={row.status} {...insightCellProps(insights, row, 'revenue')} />
    ))}
</Bar>
```

`markerFor(insights, row, fieldId)` returns the anomaly behind a marker when you need it directly, for example to open an `InvestigationCard`.

## Investigate from the action menu

Add `<InvestigateMenuItem />` to the data-point action menu next to "Filter by …" and "View underlying data". It renders only when the clicked row has a flagged anomaly: **Investigate with AI** starts one when an agent is available, and **View investigation** reopens the card once one is running, done or failed, so a dismissed result is never lost:

```tsx
<DropdownMenuContent>
    <DropdownMenuItem onSelect={() => addFilter(menu.row)}>
        Filter by {value}
    </DropdownMenuItem>
    <DropdownMenuItem onSelect={() => showUnderlyingData(menu.row)}>
        View underlying data
    </DropdownMenuItem>
    <InvestigateMenuItem
        insights={insights}
        row={menu.row}
        fieldId={menu.fieldId}
        onOpen={(anomaly) => setOpenInvestigation(anomaly.id)}
    />
</DropdownMenuContent>
```

Then render `<InvestigationCard anomaly={anomaly} insights={insights} onDismiss={...} />` under the chart for the anomaly being investigated (find it with `insights.anomalies.find((a) => a.id === openInvestigation)`; re-read it on every render so the card follows the pushed status). The card shows the spinner while running, the explanation as Markdown when ready (a summary, a "Possible drivers" list with evidence, an "Evidence" list, a "Confidence: …" line), a note when `partial`, an "Investigate again" action on error, and **Continue in Ask AI** only when `insights.canContinue` is true. When it is false the organisation keeps viewers at the explanation and the card shows no button.

Never open a dialog for the investigation yourself; the app renders state, Lightdash owns the run.

## Free-form prompts (`useAiPrompt`)

`useInsights` is the host's analysis; `useAiPrompt` lets the app ask its own question about results it already loaded. Use it for an author-written takeaway under a chart, a "what stands out in this row" explanation, or a narrative tailored to the app's domain. Answers are short plain text, not Markdown.

```tsx
import { useAiPrompt, useLightdash } from '@lightdash/query-sdk';

function RevenueTakeaway() {
    // Keep the hook result itself: `sources` needs the object useLightdash
    // returns, not a rebuilt { data, columns, ... }.
    const revenue = useLightdash(revenueByMonth);
    const { data, loading } = revenue;
    const ai = useAiPrompt();

    if (!ai.available || loading) return null;

    return (
        <div>
            <button
                disabled={ai.loading}
                onClick={() =>
                    ai.ask({
                        prompt: 'In two sentences, what should a sales lead take away from the last six months of revenue?',
                        sources: [{ result: revenue, label: 'Revenue by month' }],
                    })
                }
            >
                {ai.loading ? 'Thinking…' : 'Summarise'}
            </button>
            {ai.text && <p>{ai.text}</p>}
            {ai.error && <p role="alert">{ai.error.message}</p>}
        </div>
    );
}
```

- `sources` take the object `useLightdash` returns, as `{ result, label? }` (the `label` is the section title the model sees). If the component destructures the hook, keep a reference to the whole result (`const orders = useLightdash(q); const { data, loading } = orders;`) and pass `orders`; a rebuilt `{ data, columns }` object has no query uuid and `ask` throws. Only these rows reach the model; Lightdash reads them from the viewer's own query history, so the app sends no data.
- `focus: { row }` narrows the question to one row of a source, for example from a clicked data point: `ai.ask({ prompt: 'Why is this month unusual?', sources: [{ result: revenue }], focus: { row } })`.
- `available` is false outside a Lightdash host or when the organisation has not turned AI on for data apps. Hide the control; do not fall back to another provider.
- Trigger `ask` from a user action, or at most once per loaded view. Never on a timer, never per row. Prompts are rate limited per viewer.
- Prompts are capped at 2000 characters; write them as instructions to an analyst, and name the audience and the length you want.

## Agent investigations on demand (`useInvestigation`)

> Use this when the user wants a button or pill that sends a written instruction to the AI **agent** so it can dig into the question using other data in Lightdash — "investigate what drove this", "act on this recommendation", "analyse the drivers" — with the findings shown inside the app. `useAiPrompt` only sees rows the app already loaded; `useInvestigation` runs the same agent as an anomaly Investigate, which can query other explores (read-only) to test drivers.

```tsx
import { useInvestigation, useLightdash } from '@lightdash/query-sdk';

function DriverPill({ recommendation }: { recommendation: string }) {
    // Keep the hook result itself: `sources` needs the object useLightdash
    // returns, not a rebuilt { data, columns, ... }.
    const revenue = useLightdash(revenueByMonth);
    const investigation = useInvestigation();

    if (!investigation.available || revenue.loading) return null;

    return (
        <div>
            <button
                disabled={investigation.status === 'running'}
                onClick={() =>
                    investigation.investigate({
                        instruction: recommendation,
                        sources: [{ result: revenue, label: 'Revenue by month' }],
                    })
                }
            >
                {investigation.status === 'running'
                    ? 'Investigating…'
                    : 'Investigate'}
            </button>
            {investigation.explanation && (
                <Markdown>{investigation.explanation}</Markdown>
            )}
            {investigation.partial && (
                <p>Stopped at the query budget; findings may be incomplete.</p>
            )}
            {investigation.error && <p role="alert">{investigation.error}</p>}
            {investigation.canContinue && (
                <button onClick={investigation.continueInAskAi}>
                    Continue in Ask AI
                </button>
            )}
        </div>
    );
}
```

- One `useInvestigation()` per control; a re-run replaces that control's result. Several pills mean several hook instances.
- `sources` work exactly as in `useAiPrompt`: pass the object `useLightdash` returns, with an optional `label` the agent sees as the section title. The agent starts from these rows and may run further read-only semantic-layer queries under the viewer's own access.
- The run takes up to a couple of minutes and the explanation is **Markdown** (the anomaly `InvestigationCard`'s rendering is a good model). Show a clear running state.
- `available` is false outside a Lightdash host, when the organisation has AI off for data apps, on hosts that predate the capability, or while the viewer has no agent to run with. Hide the control; do not fall back to `useAiPrompt` silently for "investigate" asks — tell the user the host can't run investigations.
- Trigger `investigate` only from a viewer's click; runs share the organisation's investigation rate limits and daily caps. Instructions are capped at 2000 characters; write them as a brief to an analyst.

## Saved commentary shared between viewers (`useSharedAiCommentary`)

> Use this when the user wants generated commentary to be **saved** — "save the summary for the team", "everyone should see the same commentary", "let people edit the AI text", "keep the narrative with this view". It needs BOTH AI analysis and saved app state available (see the prompt's availability lines); without either, fall back to `useAiPrompt` (no saving) or plain `useAppState(key, default, { scope: 'shared' })` (no generation).

`useAiPrompt` answers one viewer once; `useSharedAiCommentary` keys the answer to the current selection and stores it in shared app state, so the first viewer generates it, later viewers of the same selection read the saved text, and anyone may edit it. The edited text is what later viewers see.

```tsx
import {
    commentarySelectionKey,
    useLightdash,
    useSharedAiCommentary,
} from '@lightdash/query-sdk';

function RegionCommentary({ region, period }: { region: string; period: string }) {
    const revenue = useLightdash(revenueQuery);
    const c = useSharedAiCommentary({
        // Same selection => same saved commentary, for every viewer.
        selectionKey: commentarySelectionKey('region', region, 'period', period),
        prompt: `In three sentences, what should a sales lead know about ${region} revenue for ${period}?`,
        sources: [{ result: revenue, label: 'Revenue' }],
    });
    const [draft, setDraft] = useState<string | null>(null);

    if (c.meta.loading || revenue.loading) return null;
    return (
        <section>
            {c.commentary ? (
                draft === null ? (
                    <>
                        <p>{c.commentary.text}</p>
                        <footer className="text-xs text-muted-foreground">
                            {c.commentary.edited
                                ? `Edited by ${c.meta.updatedBy?.name ?? 'a viewer'}`
                                : 'AI-generated'}
                        </footer>
                        <button onClick={() => setDraft(c.commentary!.text)}>Edit</button>
                        {c.canGenerate && (
                            <button disabled={c.generating} onClick={() => c.generate()}>
                                Regenerate
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} />
                        <button onClick={() => { c.saveEdit(draft); setDraft(null); }}>Save</button>
                        <button onClick={() => setDraft(null)}>Cancel</button>
                    </>
                )
            ) : (
                c.canGenerate && (
                    <button disabled={c.generating} onClick={() => c.generate()}>
                        {c.generating ? 'Generating…' : 'Generate commentary'}
                    </button>
                )
            )}
        </section>
    );
}
```

Rules:

- **`selectionKey` names the selection, not the data**: build it with `commentarySelectionKey(...)` from the filter values, segment ids or tab names that define what the viewer is looking at. Never include row values or timestamps. One key per distinct selection; shared app state allows 200 keys per app, so key on controls with bounded choices (a region picker, a period), not free-text search terms.
- `prompt`, `sources` and `focus` work exactly as in `useAiPrompt`; the generated text is saved with the prompt and a `promptId` for provenance, `edited: false`.
- Generation replaces any saved text (the Regenerate case) — trigger it from a click, never on load. Reading saved commentary is free and works even when `canGenerate` is false, so always render saved text regardless.
- Label the text "AI-generated" until `commentary.edited` is true; then show who edited it from `meta.updatedBy`.
- The saved text is visible to **every** viewer of the app, including viewers whose data permissions would show them different rows. That is the point of the feature — it behaves like a comment — but do not build it over data some viewers must not see described in words.
- Storage errors surface on `meta.error`; generation errors on `error`. Handle both like any other state.

## What the app must not do

- Do not send rows or field values anywhere. The hooks expose results; Lightdash already has the data.
- Do not add an external connection to a model provider for summaries or explanations. Use this hook.
- Do not fabricate insights when the status is `idle` or `unavailable`; render the state.
- Do not render `explanation` as HTML. `InvestigationCard` renders its Markdown safely; if you must render it elsewhere, use the shipped `Markdown` component from `@/components/insights/Markdown`.
- Do not call `analyse()` on mount or on a timer.

## When nothing is notable

`status === 'ready'` with an empty `anomalies` list is a normal outcome. The headline will say so; render it, do not treat it as an error.
