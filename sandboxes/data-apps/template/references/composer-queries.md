# Composer pipelines — `compose()`

Available only when the host advertises composer pipelines. If `compose` is not exported by the installed `@lightdash/query-sdk`, don't use it — build the card from plain `query()` results instead.

## When to use it

Use `compose()` when a card needs a computation the semantic layer can't express, over semantic-layer results:

- forecasts and trend lines (e.g. next 6 months from monthly revenue)
- statistical tests, correlations, regressions, outlier scores
- reshaping: pivots, unpivots, cohort matrices, joining two explores' results, period-over-period deltas

Don't use it for anything a plain `query()` can do (filters, sorts, table calculations, additional metrics). Every pipeline runs server-side; Python steps start a sandbox, so prefer DuckDB when SQL is enough.

## API

```tsx
import { compose, query, savedChart, useLightdash } from '@lightdash/query-sdk';

const forecastPipeline = compose('revenue-forecast')          // stable id, required
    .title('Revenue forecast')                               // 2-6 words
    .description('Projects the next 6 months of revenue from monthly orders.')
    .semantic(
        'orders',                                            // node id
        query('orders').dimensions(['order_date_month']).metrics(['total_revenue']).limit(500),
        { title: 'Monthly revenue', description: 'Revenue by order month from the semantic layer.' },
    )
    .duckdb(
        'monthly',
        `select order_date_month as month, total_revenue as revenue
         from orders order by 1`,
        { reads: ['orders'], title: 'Sorted months', description: 'Renames columns and sorts by month.' },
    )
    .python(
        'forecast',
        `import pandas as pd
import numpy as np

def run(inputs, params):
    df = inputs['monthly']
    x = np.arange(len(df))
    slope, intercept = np.polyfit(x, df['revenue'], 1)
    future = np.arange(len(df), len(df) + 6)
    months = pd.date_range(df['month'].max(), periods=7, freq='MS')[1:]
    fc = pd.DataFrame({'month': months, 'revenue': intercept + slope * future, 'is_forecast': True})
    df = df.assign(is_forecast=False)
    return pd.concat([df, fc], ignore_index=True)
`,
        { reads: ['monthly'], title: 'Linear forecast', description: 'Fits a linear trend and projects 6 months.' },
    )
    .terminal('forecast');

export function RevenueForecastCard() {
    const { data, format, loading, error, lineage } = useLightdash(forecastPipeline);
    // render like any query; columns are the terminal step's columns
    return <Card {...lineage}>…</Card>;
}
```

| Method | Notes |
|---|---|
| `compose(id)` | Pipeline id: letters, digits, `-`, `_` (max 64). Kebab-case, describes the card. |
| `.title(text)` / `.description(text)` | Always set both. Shown to users when they inspect the card. |
| `.semantic(nodeId, query(...) \| savedChart(uuid), opts?)` | A source. `opts`: `{ title, description }`. |
| `.duckdb(nodeId, sql, opts)` | `opts`: `{ reads, title, description, limit? }`. Each read is a table named by its node id. |
| `.python(nodeId, code, opts)` | `opts`: `{ reads, title, description, limit? }`. Each read is `inputs['<nodeId>']`. |
| `.terminal(nodeId)` | Required. The node whose rows `useLightdash` returns. |
| `.parameters({...})` | Declared Lightdash parameter values shared by every node. |

`useLightdash(pipeline)` returns the same shape as for a query: `data`, `columns`, `format`, `loading`, `error`, `refetch`, `lineage`, `queryUuid` (the terminal step's). `getUnderlyingData` / `downloadUnderlyingData` are not available for pipelines; `downloadResults` only supports the default `limit: 'table'`. Results are cached in memory per pipeline definition, so re-renders don't re-run Python; `refetch()` re-runs it.

## Rules

- **Sources are semantic only**: `query(...)` or `savedChart(uuid)`. Never raw warehouse SQL.
- **Node ids** must start with a letter or `_` and use only letters, digits and `_` (they are table names): `orders`, `monthly_revenue` — not `monthly-revenue`.
- **`reads`** lists node ids from the same pipeline. Every DuckDB/Python step reads at least one node. No cycles.
- **`.terminal()` is required.** A pipeline without it errors.
- **Always set `title` and `description`** on the pipeline and on every node, in plain language.
- **Stable ids**: pick the pipeline id once and keep it across iterations; rename only when the card's meaning changes.
- **Literal code**: write SQL and Python as fixed string literals at module scope. Never build them from user input, interpolation or helper functions; pass interactive values through `.filters()` on the source query or `.parameters()`.
- Max 25 nodes per pipeline. Keep pipelines small — usually 1-2 sources and 1-2 steps.

## Column names between steps

A semantic source's columns are **qualified field ids**, not the short names you passed to the builder: `query('orders').metrics(['total_revenue'])` exposes `orders_total_revenue`; a joined `customers.name` exposes `customers_name`. Rename them in the first DuckDB step (`select orders_total_revenue as revenue …`) so later steps and the UI use readable names.

The terminal step's columns reach the app unchanged: `data` rows are keyed by the exact column names the last DuckDB `select` or Python DataFrame returns, and `format(row, '<column>')` uses those names. When the terminal is a `query(...)` node, rows use short names as usual.

## DuckDB steps

- Standard DuckDB SQL. Each read is a table named by its node id: `from orders join customers using (customer_id)`.
- Quote identifiers that are keywords (`"month"`, `"order"`), and alias every computed column (`sum(x) as total`).
- Use `limit` (or the `limit` option) to keep results small enough to render.

## Python steps

```python
def run(inputs, params):
    df = inputs['monthly']   # pandas DataFrame per read, keyed by node id
    ...
    return result_df         # must return a pandas DataFrame
```

- `inputs` maps each read's node id to a pandas DataFrame; number columns are numeric, dates are `datetime64` (tz-naive for dates), booleans are nullable booleans. `params` holds the pipeline's parameter values.
- Return a pandas DataFrame with at least one column. Column names must be identifiers (`^[A-Za-z_][A-Za-z0-9_]*$`, max 63 chars) and unique.
- Available: `pandas`, `numpy`, `scipy`, `scikit-learn`, `pyarrow`, `polars`. No `pip install`, no network access, no files outside the sandbox.
- Each run has a 5-minute limit and code must be under 64 KB. Keep inputs aggregated (monthly, by segment) rather than row-level.
- Errors from `run()` surface as `error` in `useLightdash`; render the normal error state.

## Tagging cards for inspection

Every query-bound card is traceable in the host's Inspect data view:

- **One card/block per query or pipeline**, and spread `{...lineage}` on that block's root element.
- **Give every query a stable id**: `compose('<kebab-id>')` for pipelines, `query(...).id('<kebab-id>')` / `savedChart(uuid).id('<kebab-id>')` for plain queries. The id describes the card (`revenue-forecast`, `top-customers-table`) and stays the same across iterations.
- **Every query gets a title and description**: `.label()` + `.description()` on `query()` / `savedChart()`, `.title()` + `.description()` on `compose()`.

```tsx
const topCustomers = query('customers')
    .id('top-customers-table')
    .label('Top customers')
    .description('The 10 customers with the highest lifetime revenue.')
    .dimensions(['customer_name'])
    .metrics(['lifetime_revenue'])
    .sorts([{ field: 'lifetime_revenue', direction: 'desc' }])
    .limit(10);
```
