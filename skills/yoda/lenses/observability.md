# Observability

## Review

- **Skip when:** a reworded log message, or the built-in Usage Analytics dashboards and explores (a product feature).
- **Worst case:** personal data in logs, events, metric labels or Sentry titles.
- **Evidence:** skim for what is recorded; open the event type in `LightdashAnalytics.ts` for any changed event.
- **no personal data:** no emails, names, query results, SQL with literal values, warehouse project or table names, or tokens in logs, events, metric labels or error messages that become Sentry titles.
  A name or email in a track or identify call sits behind `isTrackingAnonymized`; log text built from errors or URLs goes through `scrubSecrets` or `redactCredentialError`. Any is Fix.
- **enough to debug:** a failure logs the ids and step needed to find it, at the right level, with no per-row, per-retry or tight-timer noise at scale.
- **expected errors:** an expected case (anonymous caller, bad client input, retired route, missing table) returns a proper error class, logs below error, or is added to `IGNORE_ERRORS`; a plain `Error` there becomes a 500 and a Sentry event per request. Heads-up.
- **events stable:** follow changed or removed events and properties to their readers.
  A broken reader is Heads-up naming the event, property and reader.
- **identity intact:** identify and group calls still link a user to their org on every signup and join path; a skipped call shows up only as broken attribution.
- **metrics bounded:** Prometheus labels take a small fixed set (context, status, warehouse type); an id, URI or free text as a label is Fix.

## Impact

- **breaking:** existing dashboards/alerts can't read a changed metric, event, property or tag.
- **notable:** new metric, event, property or tag.
- **minor:** other internal changes.

## Diff

```ts
type ObservabilityDiff = Diff & {
    kind: string;  // prometheus, trace, sentry or analytics
};
```

- **Name:** the exact metric, span attribute, analytics event or Sentry tag.
- **Granularity:** one diff per item; changed properties of the same analytics event at the same impact share a row.
  A single property or step value follows its event after a `·` (`onboarding.step_completed · first_query`); several properties go in the note.
  A Sentry diff names the tag or filter people search by; only when there is none, the function that sends the report.
- Logs get no diff: they are checked silently and reach a finding only when they fail.

```json
{ "lens": "Observability", "change": "modified", "impact": "notable", "name": "onboarding.step_completed · first_query", "kind": "analytics", "note": "fires once per user on the first query" }
```
