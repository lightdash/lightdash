# AI analysis (`useInsights`)

> Read this when the user wants an executive summary, "what changed and why", anomaly callouts, "flag anything unusual", or an "AI insight" block inside the app.

Lightdash analyses the queries the app ran for the viewer's current view and pushes the result into the app. The app **renders** that analysis and can trigger it; it never sends its own prompt, never calls a model provider, and never needs an API key. Do not wire an external connection to an LLM for this — the native hook is the supported path and respects the viewer's data permissions.

Two operations exist, both run by Lightdash:

- **Detect** — reads the results the app already loaded and returns a headline, a summary, a list of notable data points (anomalies) with the query, field and row they refer to, and the limitations of the data (no comparison period, truncation, and so on).
- **Investigate** — for one anomaly, an AI agent with read-only query tools looks for possible drivers using data beyond the page and returns a Markdown explanation with evidence and a confidence line. It runs asynchronously; the app shows progress from the pushed status.

```tsx
import { useInsights } from '@lightdash/query-sdk';
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

Render a block near the top of the page. It must handle every status:

```tsx
import { useInsights } from '@lightdash/query-sdk';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';

function ExecutiveSummary() {
    const view = useInsights();

    // The org has not enabled AI analysis: render nothing, never a stub.
    if (view.status === 'unavailable') return null;

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> Executive summary
                </CardTitle>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={view.analyse}
                    disabled={view.status === 'analysing'}
                >
                    {view.status === 'analysing' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                    {view.status === 'ready' ? 'Refresh' : 'Analyse'}
                </Button>
            </CardHeader>
            <CardContent>
                {view.status === 'idle' && (
                    <p className="text-muted-foreground">
                        Click Analyse for a summary of what is on this page.
                    </p>
                )}
                {view.status === 'analysing' && (
                    <p className="text-muted-foreground">Reading the data on this page…</p>
                )}
                {view.status === 'error' && (
                    <p className="text-destructive">{view.error}</p>
                )}
                {view.status === 'ready' && (
                    <>
                        {view.stale && (
                            <p className="text-sm text-muted-foreground">
                                The view changed since this was generated. Refresh to update.
                            </p>
                        )}
                        <h3 className="text-lg font-semibold">{view.headline}</h3>
                        <p>{view.summary}</p>
                        {view.limitations.length > 0 && (
                            <ul className="text-sm text-muted-foreground">
                                {view.limitations.map((l) => (
                                    <li key={l}>{l}</li>
                                ))}
                            </ul>
                        )}
                        <p className="text-xs text-muted-foreground">
                            AI-generated from the data on this page
                            {view.dataAsOf ? ` · Data as of ${view.dataAsOf}` : ''}
                        </p>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
```

Rules for the block:

- Say "AI-generated" in the footer. Never name a model or provider.
- Show the limitations; they are what keeps the summary honest.
- Never mount it unconditionally in a modal or overlay; it is page content.
- `analyse()` re-runs even when a result exists (that is the Refresh case). Do not call it in an effect on mount; the viewer clicks.

## Per-chart: anomalies on the data points

`useInsights(result)` with a `useLightdash` result narrows to that chart:

```ts
const orders = useLightdash(ordersQuery);
const insights = useInsights(orders);
// insights.status           same as the view
// insights.anomalies        the anomalies that refer to this query
// insights.matches(row)     the anomalies whose dimension values match this row
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

Mark the flagged rows on the chart. `matches(row)` takes the raw result row, so call it per datum. Only `high`, `medium` and `positive` earn a marker; `info` is context for the summary (a gap, a partial period), so never paint it on the chart:

```tsx
import { Bar, BarChart, Cell } from 'recharts';

const MARKED = new Set(['high', 'medium', 'positive']);
const marker = (insights, row) =>
    insights.matches(row).find((a) => MARKED.has(a.severity)) ?? null;

function OrdersByStatus() {
    const orders = useLightdash(ordersQuery);
    const insights = useInsights(orders);

    return (
        <BarChart data={orders.data}>
            <Bar dataKey="orders_count">
                {orders.data.map((row) => {
                    const flagged = marker(insights, row) !== null;
                    return (
                        <Cell
                            key={row.orders_status}
                            stroke={flagged ? 'var(--destructive)' : undefined}
                            strokeWidth={flagged ? 2 : 0}
                        />
                    );
                })}
            </Bar>
        </BarChart>
    );
}
```

Keep the marker subtle (an outline, a dot, a badge in the tooltip), and show the anomaly `text` on hover so the viewer learns why the point is marked. Tint by severity: `positive` is not a warning.

### Markers on line and area charts must stay clickable on hover

Recharts draws `activeDot` on top of `dot` while the cursor is over a point. With the default `activeDot={{ r: 5 }}` the hover dot covers the marker and takes the click, so the action menu only opens from a one-pixel rim. Render the same marker component for both, with the same click handler, or turn the hover dot off:

```tsx
// Recharts clones the dot element and merges cx, cy and payload into its
// props, so extra props like insights and onOpenMenu pass straight through.
const Marker = ({ cx, cy, payload, insights, onOpenMenu }) => {
    const anomaly = marker(insights, payload);
    return (
        <circle
            cx={cx}
            cy={cy}
            r={anomaly ? 5 : 3}
            fill={anomaly ? 'var(--destructive)' : 'var(--chart-1)'}
            style={{ cursor: 'pointer' }}
            onClick={(e) => onOpenMenu(payload, e)}
        />
    );
};

function OrdersOverTime() {
    const orders = useLightdash(ordersQuery);
    const insights = useInsights(orders);
    const [menu, setMenu] = useState(null);
    const openMenu = (row, e) => setMenu({ row, x: e.clientX, y: e.clientY });
    const dot = <Marker insights={insights} onOpenMenu={openMenu} />;

    return (
        <LineChart data={orders.data}>
            <Line dataKey="orders_count" dot={dot} activeDot={dot} />
            {/* or: activeDot={false} */}
        </LineChart>
    );
}
```

Whatever element carries the click handler must be the topmost one at that position: render markers after the series, never under a hover overlay or a tooltip cursor.

## Investigate from the action menu

When a clicked data point has a matching anomaly, add **Investigate** to the point's action menu next to "Filter by …" and "View underlying data". Gate it on `insights.canInvestigate` and on the investigation not already running or ready:

```tsx
const anomaly = insights.matches(row)[0];

{anomaly && insights.canInvestigate && anomaly.investigation.status === 'idle' && (
    <DropdownMenuItem onSelect={() => insights.investigate(anomaly.id)}>
        Investigate with AI
    </DropdownMenuItem>
)}
```

Then render the investigation state wherever the anomaly is shown (a card under the chart, a side sheet):

- `running` — a spinner and "Investigating…". It can take a minute.
- `ready` — render `explanation` as Markdown (it contains a summary, a "Possible drivers" list with the evidence for each, an "Evidence" list, and a "Confidence: …" line). If `partial` is true, say the query budget ran out. When `insights.canContinue` is true, offer a **Continue in Ask AI** button that calls `insights.continueInAskAi(anomaly.id)`; Lightdash opens the thread. When it is false the organisation keeps viewers at the explanation: render no button.
- `error` — show `error` and offer Investigate again.

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

## What the app must not do

- Do not send rows or field values anywhere. The hooks expose results; Lightdash already has the data.
- Do not add an external connection to a model provider for summaries or explanations. Use this hook.
- Do not fabricate insights when the status is `idle` or `unavailable`; render the state.
- Do not render `explanation` as HTML. It is Markdown; render it as text or through a Markdown component.
- Do not call `analyse()` on mount or on a timer.

## When nothing is notable

`status === 'ready'` with an empty `anomalies` list is a normal outcome. The headline will say so; render it, do not treat it as an error.
