# AI agent merge-query parity

## Goal

Let agents answer questions that need measures from multiple explores without
falling back to raw SQL. Preserve the existing agent workflow: query execution
produces governed data and `generateVisualization` turns that data intent into
an artifact.

## Product contract

Add merge support to both semantic query tools:

- `runQuery` can execute a merge and return rows without creating a chart.
- `generateVisualization` can execute the same merge and create a chart.
- Existing single-explore inputs remain unchanged.
- A merge uses two or more independently valid metric queries, shared join-key
  parts, a join type, and optional post-merge calculations.
- The agent must discover and validate fields in every source explore. It must
  not invent cross-explore field IDs or use raw SQL to reproduce a supported
  merge.

## Interface

Model query intent as a discriminated union inside the tools:

```ts
type SemanticQueryIntent =
    | { type: 'metric'; query: AiMetricQueryWithFilters }
    | { type: 'merge'; query: MergeQuery; parameters?: ParametersValuesMap };
```

Keep visualization config outside this union. Both tools share query
validation and execution; `generateVisualization` additionally validates and
persists presentation. Merge execution calls
`AsyncQueryService.executeAsyncMergeQuery` with the runtime's existing account,
project, query context, and an interactive mode. No HTTP loopback and no
compile-preview call.

Add an internal `runAsyncMergeQuery` dependency beside `runAsyncQuery`. It
awaits the ordinary async result, returns the same `{queryUuid, rows, fields,
cacheMetadata}` shape, applies agent result expiration, and turns a `refused`
outcome into actionable tool feedback preserving source-scoped errors.

## Visualization

The generated chart addresses the merged result field IDs returned by compile
metadata. Initial parity should support table and Cartesian charts without
pivoting. Pivot support follows only after the tool schema can express merged
field roles unambiguously; execution already accepts optional chart state, so
this does not require another endpoint.

Artifacts persist the discriminated semantic intent, not derived pivot
configuration or compiled SQL. Existing artifact migration continues to treat
an absent discriminator as a metric query.

## Safety and observability

- Reuse each source explore's access checks, required filters, parameters, and
  custom-metric validation.
- Apply the existing agent query limit to the final merged result.
- Count a merge as one warehouse query for retry caps and `onWarehouseQuery`.
- Record the runtime's AI query context and expose the resulting query UUID in
  Deep Research exactly as metric queries do.
- Keep the frontend feature flag independent from agent availability; gate the
  new tool input explicitly until evals pass.

## Acceptance tests

1. `runQuery` joins two seeded explores and returns source-correct values.
2. `generateVisualization` creates a table and a Cartesian artifact from the
   same merge intent.
3. Invalid join grain/type, inaccessible explores, missing parameters, and
   fan-out return actionable tool errors and start no query.
4. Agent limits affect only the final merge; source CTEs remain complete.
5. One tool call causes one merge compilation and one warehouse execution.
6. Existing single-explore tool snapshots and saved artifacts remain stable.
