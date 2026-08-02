# Query parameters (`.parameters()`)

> Read this before using `.parameters()` — only when the dbt YAML declares a `parameters:` block (model `meta:` or `lightdash.config.yml`).

Parameters are project- or model-level variables declared in the dbt YAML and substituted into SQL via `${lightdash.parameters.…}`. They let one query swap pieces of its SQL at runtime — e.g. the docs' metric-based parameter, where a single dropdown controls which metric a KPI shows (`total_revenue`, `won_revenue`, `deal_count`, `win_rate`). Pass values at query time with `.parameters()`:

```ts
const kpiQuery = query('deals')
    .label('Selected KPI')
    .metrics(['selected_kpi'])
    .limit(1)
    .parameters({ kpi_selector: 'total_revenue' });
```

`.parameters(map)` is immutable and merges across calls (later keys win). Values can be a string, number, or array of either: `{ region: ['EMEA', 'AMER'] }`.

**Key naming mirrors the SQL reference syntax** — get this wrong and the value is silently ignored:

| Parameter scope | Declared in | SQL reference | `.parameters()` key |
|---|---|---|---|
| Project-level | `lightdash.config.yml` | `${lightdash.parameters.region}` | `{ region: 'EMEA' }` |
| Model-level | a model's `meta.parameters` | `${lightdash.parameters.orders.region}` | `{ 'orders.region': 'EMEA' }` |

**Discover available parameters before using them** — never guess parameter names or values. Look for a `parameters:` block in `lightdash.config.yml` (project-level) or under a model's `meta:` / `config.meta:` (model-level). Each entry's key is the parameter name; its `options` / `default` tell you the valid values:

```yaml
# lightdash.config.yml — project-level parameter
parameters:
    kpi_selector:
        label: "KPI Metric"
        options: ["total_revenue", "won_revenue", "deal_count", "win_rate"]
        default: "total_revenue"
```

**Driving a parameter from UI** — `useLightdash` keys its cache off the built query (parameters included), so a parameter bound to component state re-fetches when it changes. Keep the base query at module scope and apply `.parameters()` in a `useMemo` (same pattern as global filters — never build the whole query in render):

```tsx
const baseQuery = query('deals')
    .label('Selected KPI')
    .metrics(['selected_kpi'])
    .limit(1);

export function SelectedKpi() {
    const [kpi, setKpi] = useState('total_revenue');
    const q = useMemo(
        () => baseQuery.parameters({ kpi_selector: kpi }),
        [kpi],
    );
    const { data, format, loading } = useLightdash(q);
    // a <Select> bound to setKpi (total_revenue | won_revenue | deal_count | win_rate)
    // re-runs the query when changed
}
```

Parameters are independent of `.filters()` — a filter restricts which rows are scanned; a parameter changes the SQL itself. Use a parameter only when the YAML declares one; otherwise reach for `.filters()`.
