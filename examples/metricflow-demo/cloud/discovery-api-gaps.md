# dbt Cloud Discovery API: MetricFlow definition fields missing vs manifest (MWE)

Minimal reproducible example for a dbt support ticket. Lightdash (partner
integration, `X-dbt-partner-source: lightdash`) translates MetricFlow
definitions into Lightdash metrics by querying the Discovery API definition
state (`environment(id:).definition.semanticModels / .metrics`). Several
fields that are present in the run's `manifest.json` are **not queryable
anywhere in the Discovery API schema**, which blocks or degrades the
translation. Everything below is reproducible against a live environment.

## Environment

- Account **20983** ("Lightdash (Partner)", US multi-tenant, `vj034.us1.dbt.com`)
- Project **563664** ("MetricFlow Cloud demo"), environment **469722**
  (production, release track `latest`; repro runs used
  `dbt 2026.7.28+709584c`, manifest schema v12)
- dbt project source:
  [`examples/metricflow-demo/cloud`](https://github.com/lightdash/lightdash/tree/main/examples/metricflow-demo/cloud)
  in the lightdash/lightdash repo (legacy MetricFlow spec: top-level
  `semantic_models:` + `metrics:`)
- Discovery API endpoint: `https://vj034.metadata.us1.dbt.com/graphql`
- Any service token with 'Metadata Only' works; set `DBT_CLOUD_SERVICE_TOKEN`
  before running the repro commands.

## Input YAML (`models/schema.yml`, excerpts)

```yaml
semantic_models:
  - name: orders
    model: ref('orders')
    entities:
      - name: order
        type: primary
        expr: order_id                 # <-- entity expr
    dimensions:
      - name: status_upper
        type: categorical
        label: Status (upper)          # <-- dimension label
        expr: upper(status)            # <-- dimension expr
        config:
          meta:
            group_label: Formatted     # <-- dimension config.meta
    measures:
      - name: total_revenue
        agg: sum
        expr: amount
        label: Total revenue (measure) # <-- measure label
      - name: p95_order_value
        agg: percentile
        expr: amount
        agg_params:                    # <-- measure agg_params
          percentile: 0.95
          use_discrete_percentile: false
      - name: internal_order_count
        agg: count_distinct
        expr: customer_id
        create_metric: true
        config:
          meta:                        # <-- measure config.meta
            hidden: true
            group_label: Internal
```

## Ground truth: the same run's `manifest.json` artifact

`GET /api/v2/accounts/20983/runs/<run_id>/artifacts/manifest.json` →
`semantic_models["semantic_model.metricflow_cloud_demo.orders"]`:

```json
// measures[...]
{"name": "p95_order_value", "agg": "percentile", "expr": "amount", "label": null,
 "agg_params": {"percentile": 0.95, "use_discrete_percentile": false, "use_approximate_percentile": false},
 "config": {"meta": {}}, ...}
{"name": "total_revenue", "agg": "sum", "expr": "amount", "label": "Total revenue (measure)",
 "agg_params": null, "config": {"meta": {}}, ...}
{"name": "internal_order_count", "agg": "count_distinct", "expr": "customer_id", "label": null,
 "agg_params": null, "config": {"meta": {"hidden": true, "group_label": "Internal", "hex": {"synced": true}}}, ...}

// dimensions[...]
{"name": "status_upper", "type": "categorical", "label": "Status (upper)",
 "expr": "upper(status)", "config": {"meta": {"group_label": "Formatted"}}, ...}

// entities[...]
{"name": "order", "type": "primary", "expr": "order_id", "config": {"meta": {}}, ...}
```

## What the Discovery API returns for the same nodes

```bash
curl -s -X POST "https://vj034.metadata.us1.dbt.com/graphql" \
  -H "Authorization: Bearer $DBT_CLOUD_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "query D($environmentId: BigInt!) { environment(id: $environmentId) { definition { semanticModels(first: 10) { edges { node { name measures { name agg expr createMetric description } dimensions { name type typeParams description } entities { name type description } } } } } } }", "variables": {"environmentId": 469722}}'
```

```json
// measures[...] — no agg_params, label, or config anywhere:
{"name": "p95_order_value", "agg": "percentile", "expr": "amount", "createMetric": false, "description": null}
{"name": "total_revenue", "agg": "sum", "expr": "amount", "createMetric": false, "description": "Sum of order amounts"}
{"name": "internal_order_count", "agg": "count_distinct", "expr": "customer_id", "createMetric": false, "description": null}

// dimensions[...] — no expr, label, or config:
{"name": "status_upper", "type": "categorical", "typeParams": null, "description": null}

// entities[...] — no expr:
{"name": "order", "type": "primary", "description": null}
```

Those are the **complete** field sets — requesting the missing fields fails
GraphQL validation:

```bash
curl -s -X POST "https://vj034.metadata.us1.dbt.com/graphql" \
  -H "Authorization: Bearer $DBT_CLOUD_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "query D($environmentId: BigInt!) { environment(id: $environmentId) { definition { semanticModels(first: 1) { edges { node { measures { name aggParams label config } dimensions { name expr label config } entities { name expr } } } } } } }", "variables": {"environmentId": 469722}}'
```

```
Cannot query field "aggParams" on type "SemanticModelMeasure".
Cannot query field "label" on type "SemanticModelMeasure". Did you mean "name"?
Cannot query field "config" on type "SemanticModelMeasure".
Cannot query field "expr" on type "SemanticModelDimension".
Cannot query field "label" on type "SemanticModelDimension". Did you mean "name"?
Cannot query field "config" on type "SemanticModelDimension".
Cannot query field "expr" on type "SemanticModelEntity".
```

Schema introspection confirms the full field lists:

- `SemanticModelMeasure`: `agg`, `createMetric`, `description`, `expr`, `name`
- `SemanticModelDimension`: `description`, `name`, `type`, `typeParams`
- `SemanticModelEntity`: `description`, `name`, `type`

We also checked for alternative locations: the applied state has no semantic
model resources at all (`AppliedState` exposes models/seeds/sources/… only),
and `MetricDefinitionNode.typeParams.input_measures[...]` entries carry only
`{name, alias, filter, offset_*, fill_nulls_with, join_to_timespine}` — no
`agg_params` there either. Full-schema introspection finds no type exposing
`agg_params`/`percentile`.

## Summary: manifest field → Discovery API availability

| Node | Manifest field | Discovery API |
| --- | --- | --- |
| measure | `agg_params` (`percentile`, `use_discrete_percentile`, …) | ❌ missing |
| measure | `label` | ❌ missing |
| measure | `config.meta` | ❌ missing (no `config` or `meta` on the type) |
| dimension | `expr` | ❌ missing |
| dimension | `label`, `config.meta` | ❌ missing |
| entity | `expr` | ❌ missing |
| metric | `config.meta` | ✅ exposed as `MetricDefinitionNode.meta` |
| metric | `type_params`, `filter`, `label`, `description` | ✅ |

## Impact on our integration

1. **`agg_params` is the blocker**: percentile measures cannot be interpreted
   at all — the percentile value is unrecoverable from any Discovery API
   field, so we must skip percentile metrics for dbt Cloud-connected projects
   (translating without it would silently compute a median).
2. **Dimension `expr`** is needed to resolve
   `{{ Dimension('entity__dim') }}` metric filters into SQL; without it we can
   only assume the dimension name is a physical column.
3. **Measure/dimension `label` + `config.meta`** carry display metadata
   (labels, `hidden`, grouping) that we can honor from a local manifest but
   not through the API.

Request: expose `aggParams`, `label` and `config` (or `meta`) on
`SemanticModelMeasure` and `SemanticModelDimension`, and `expr` on
`SemanticModelDimension` and `SemanticModelEntity` in the definition state —
mirroring the manifest's `semantic_models` entries, similar to how
`MetricDefinitionNode` already exposes `typeParams`/`filter`/`meta` as
manifest-shaped JSON.

One non-issue we ruled out while testing (included to save you time):
`createMetric` returns `false` for measures authored with
`create_metric: true` — but the run's `manifest.json` also has
`create_metric: false` (the parser materializes the auto-created metric into
`metrics` and resets the flag), so the API is faithful to the manifest there.
