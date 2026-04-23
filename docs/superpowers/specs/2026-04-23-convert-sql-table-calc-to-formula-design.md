# Convert SQL Table Calculation to Formula (AI-powered)

**Ticket:** PROD-7083
**Date:** 2026-04-23
**Status:** Design approved, implementation pending

## Problem

Users with existing SQL table calculations cannot convert them to formula-based
table calculations without deleting the SQL calc and re-creating a new one —
which breaks `fieldId` continuity and forces them to fix every inbound
reference (explore sorts, column order, downstream table calcs that reference
it by name). On `main` today the input-mode SegmentedControl is hidden for
existing calcs, so there is no conversion path at all.

A WIP branch (`04-22-feat_allow_switching_existing_sql_table_calc_to_formula`,
commit `cd51275909`) addresses this by unlocking the SegmentedControl — but
flipping to formula mode clears the SQL content, so the user must rewrite the
expression by hand.

## Approach

Add a dedicated **"Convert to formula"** button in the table calculation edit
modal that uses the existing ambient AI formula-generation endpoint to
produce a formula equivalent of the user's SQL. The user reviews the suggested
formula in a preview panel and explicitly Applies or Discards it. The
SegmentedControl unlock is abandoned in favour of this button — the WIP branch
will not be merged.

## User flow

**Entry point.** User opens the table-calculation edit modal on an **existing
SQL calc**. The Convert button renders iff:

1. `tableCalculation` exists AND `isSqlTableCalculation(tableCalculation)` is true
2. `isFormulaSupported === true` (warehouse dialect is in `SUPPORTED_DIALECTS`)
3. `health.isAmbientAiEnabled === true`

When any condition is false the modal looks exactly like it does on `main`
today — locked to SQL mode, no conversion affordance.

**Happy path.**

1. User sees a "Convert to formula" button (wand icon) in the "Input mode"
   Group next to the editor header.
2. User clicks. Button enters loading state (spinner, disabled).
3. Within ≤15s the backend returns `{formula, format}`. A preview panel
   appears **below** the SQL editor showing the generated formula in a
   read-only syntax-highlighted box, with "Apply" (primary) and "Discard"
   (secondary) buttons.
4. User clicks **Apply**. Modal switches to formula mode; the formula editor
   is seeded with `{formula, format}`. The SQL in form state is left behind
   (formula mode ignores it). Preview panel dismisses. The user can tweak
   the formula before saving.
5. User clicks the modal's **Save**. `explorerActions.updateTableCalculation`
   replaces the calc in place, preserving `fieldId` and all inbound references.

**Discard path.** Clicking Discard dismisses the preview panel. SQL editor is
unchanged. Button returns to idle. Clicking Convert again fires a new request
(no caching).

**Failure path.** The request fails (error, 15s timeout, or the generated
formula fails the agent's parse validation after one retry). The preview
panel appears with an inline error state (danger Callout, concise message,
"Try again" button). The SQL editor is untouched. "Try again" re-fires the
same request.

**Close-without-save.** Closing the modal at any point discards everything
(standard modal semantics).

## Frontend architecture

### Files

- `packages/frontend/src/features/tableCalculation/components/TableCalculationModal.tsx`
  — button, preview wiring, state
- `packages/frontend/src/features/tableCalculation/components/FormulaConversionPreview.tsx`
  (+ CSS module) — new preview component
- `packages/frontend/src/hooks/useConvertSqlToFormula.ts` — new sibling hook
- `packages/frontend/src/hooks/utils/buildFormulaAiContext.ts` — new shared
  helper extracted from the existing hook
- `packages/frontend/src/hooks/useGenerateFormulaTableCalculation.ts` —
  migrated to use the shared helper and pass `mode: 'prompt'`

### Button placement

The existing modal has an "Input mode" Group at `classes.inputModeHeader`.
Today it renders the SegmentedControl only for new calcs. On existing SQL
calcs with ambient AI enabled, the SegmentedControl slot is empty — we place
the Convert button there, aligned right of the "Input mode" label.

### Button spec

- Label: "Convert to formula"
- Icon: Tabler wand (`IconWand` — AI affordance, consistent with existing
  formula AI input)
- Mantine `<Button>`, `variant="light"`, `size="xs"`, `color="indigo"`
- Loading state uses Mantine's `loading` prop (spinner + disabled)
- On click: fires `hook.convert()`

### Preview component — `FormulaConversionPreview`

A new component rendered below the `editorContainer` Box (around line 614 of
the modal). Driven by props from the hook:

- `isLoading` → skeleton / placeholder + caption "Converting your SQL…"
- `error` → `<Callout variant="danger">` with concise message +
  "Try again" button that calls `onRetry()`
- `result` (success) → read-only formula display (reuse the read-only Monaco
  instance from `FormulaForm` for identical syntax highlighting) + Apply /
  Discard buttons

Styled as a compact `<Paper>` with a header ("Suggested formula") and body.
CSS module alongside the component.

### Hook — `useConvertSqlToFormula`

Sibling to `useGenerateFormulaTableCalculation`. Extract the shared field-context
marshalling into `buildFormulaAiContext(explore, metricQuery) → {tableName,
fieldsContext, existingTableCalculations}` so both hooks call it — no
duplication.

**Public API:**

```ts
type UseConvertSqlToFormulaOptions = {
    projectUuid: string | undefined;
    explore: Explore | undefined;
    metricQuery: MetricQuery;
    onSuccess?: (result: GeneratedFormulaTableCalculation) => void;
};

type UseConvertSqlToFormulaReturn = {
    convert: (sourceSql: string) => void;
    reset: () => void;
    result: GeneratedFormulaTableCalculation | null;
    isLoading: boolean;
    error: ApiError | null;
};
```

Same 15s timeout + `AbortController` pattern as the existing hook. Aborts
previous in-flight request on a new `convert()` call.

### Apply wiring

When Apply is clicked:

```ts
setEditMode(EditMode.FORMULA);
form.setFieldValue('formula', result.formula);
if (result.format) form.setFieldValue('format', result.format);
hook.reset();
```

The existing `sql` form value is left untouched — formula mode ignores it.
On Save, the existing modal write path detects formula mode and produces a
formula calc (dropping the SQL payload), while `updateTableCalculation`
preserves the `fieldId`.

### Discard wiring

`hook.reset()` — preview panel unmounts; editor and mode untouched.

## Backend API

### Request type — discriminated union

Per CLAUDE.md ("no duck typing — make types intentional"), we refactor the
request type to a discriminated union rather than adding an optional
`sourceSql?` field alongside `prompt: string`.

`packages/common/src/ee/ambientAi/index.ts`:

```ts
type FormulaAiContext = {
    tableName: string;
    fieldsContext: TableCalculationFieldContext[];
    existingTableCalculations: string[];
};

export type GenerateFormulaTableCalculationRequest =
    | ({ mode: 'prompt'; prompt: string; currentFormula?: string } & FormulaAiContext)
    | ({ mode: 'convert-sql'; sourceSql: string } & FormulaAiContext);
```

`existingTableCalculations` becomes required (was optional) — both modes
always pass it.

Response (`GeneratedFormulaTableCalculation`) unchanged.

### Route & controller

Same endpoint: `POST /ai/{projectUuid}/formula-table-calculation/generate`.
No new route. `AiController.generateFormulaTableCalculation` is a pass-through.

### Service layer

`AiService.generateFormulaTableCalculation` forwards the payload (now carrying
`mode`) to the agent function.

### Caller migration

The only existing caller is `useGenerateFormulaTableCalculation` (used by the
free-prompt AI input in `FormulaForm`). Updated to pass `mode: 'prompt'`.

### Validation

TSOA generates a runtime validator from the discriminated union — rejects
payloads where `mode` doesn't match one of the two shapes.

### Auth / gating

Ambient-AI gating already lives in `AiService.getAmbientAiModel(user)` (line
120) — throws if ambient AI is disabled. No additional check needed; frontend
won't render the button when disabled, backend is defence-in-depth.

## Agent changes — `formulaTableCalculationGenerator.ts`

### Unchanged

- `buildSystemPrompt()` — same rules apply to both modes (formula syntax,
  type consistency, field ID usage, no leading `=`)
- `FormulaTableCalculationSchema` — response shape stays `{formula, format}`
- `validateFormula` + retry-on-parse-error loop — conversion gets this for
  free
- `generateObject` call — only the user message content changes

### Changed — user message branches on mode

```ts
function buildUserContent(context: FormulaTableCalculationContext): string {
    switch (context.mode) {
        case 'prompt':
            return buildPromptModeContent(context);   // existing logic extracted
        case 'convert-sql':
            return buildConvertSqlModeContent(context);
        default:
            return assertUnreachable(context, 'Unknown formula generation mode');
    }
}
```

**Convert-sql user message:**

```
Convert the following SQL expression into an equivalent formula expression.
Use only the formula syntax described in the system prompt. Only use the
available fields listed below — rewrite any column references to the provided
field IDs.

Source SQL:
${context.sourceSql}

Data source: "${context.tableName}"
Available fields to reference:
${fieldReferenceGuide}

Note: These table calculation names are already taken: ${existingTableCalculations}
```

No `currentFormula` block (doesn't apply). No "improve/modify" framing.

### Context type

Internal `FormulaTableCalculationContext` mirrors the public request type's
discriminated union. Mode-specific fields (`prompt`/`currentFormula` vs
`sourceSql`) live on their branches; shared fields are common.

### Explicitly NOT changed in v1

- **No dialect awareness.** We don't pass warehouse dialect into the prompt.
  The formula package syntax is dialect-agnostic; the AI is converting SQL
  semantics to formula semantics. Unrepresentable source SQL → validation
  fails → retry fails → agent throws → frontend shows error UX.
- **No structured "unsupported" response.** Response schema stays
  `{formula, format}`. Failure signal is: generated formula doesn't parse
  after one retry → agent throws. Reuses existing failure plumbing.

## Gating summary

Button renders iff ALL true (frontend check):

- `tableCalculation` exists AND is SQL-type
- `isFormulaSupported` (warehouse dialect in `SUPPORTED_DIALECTS`)
- `health.isAmbientAiEnabled === true`

Backend defence-in-depth: `getAmbientAiModel(user)` throws when ambient AI is
disabled.

## Analytics

Extend the existing `ai.formula_table_calculation.generated` event with a
`mode: 'prompt' | 'convert-sql'` property. Funnels keep working; dashboards
can segment by mode.

Frontend tracks two user actions:

- `formula_table_calculation.convert_clicked` — button clicked (before request)
- `formula_table_calculation.convert_applied` — Apply clicked (conversion
  accepted)

No "discarded" or "retry" events for v1 — funnel (clicked → applied) is
sufficient signal.

## Testing

**Backend:**

- `formulaTableCalculationGenerator` unit tests covering both modes, plus
  existing-prompt-mode regression
- Convert-sql with representable SQL → valid parseable formula
- Convert-sql with unrepresentable SQL (mocked LLM returning garbage) →
  agent throws after retry
- Type-level test: discriminated union enforces exactly-one-shape at compile
  and runtime (TSOA validator)

**Frontend:**

- `FormulaConversionPreview` component test: renders each state, Apply /
  Discard / Try-again callbacks fire correctly
- `useConvertSqlToFormula` hook test: mocked API, abort-on-unmount, 15s
  timeout, `reset()` clears state

**Manual QA matrix** (in PR description):

- Ambient AI on + SQL calc → button appears
- Ambient AI on + formula calc → no button
- Ambient AI on + template calc → no button
- Ambient AI on + new calc (no `tableCalculation`) → no button
- Ambient AI off + SQL calc → no button
- Unsupported warehouse dialect → no button (even if ambient AI on)
- Apply preserves `fieldId` and inbound references (sort, column order,
  downstream refs)
- Close modal after Apply but before Save → no changes persisted
- Close modal after Save → formula calc persisted, SQL content dropped

## Out of scope for v1

- Formula → SQL conversion (opposite direction) — no demand
- Conversion + free-form hints — rejected; use existing AI input in formula
  mode after Apply if refinement needed
- Dialect-specific conversion prompts
- Structured "unsupported SQL" response — simple throw path instead
- Upsell UX for non-ambient-AI users — hidden entirely
- Caching of conversion results

## Known risks

- The LLM may produce a formula that parses but is semantically wrong
  (off-by-one on boundaries, wrong aggregation scope). The preview + explicit
  Apply step keeps the user in the loop; Save is a second gate. We document
  this risk and don't engineer around it in v1.
- Conversion of SQL that references `${TABLE}.field` patterns (Jaffle shop
  conventions) needs the agent to rewrite to the field-ID form shown in
  `fieldReferenceGuide`. The system prompt already instructs "Only use fields
  that are provided in the available fields list — Use the exact field IDs
  shown." Should be sufficient; validated via tests.

## Implementation sequencing

1. Common types (`packages/common/src/ee/ambientAi/index.ts`) — discriminated
   union
2. Backend agent (`formulaTableCalculationGenerator.ts`) — branch on mode,
   extract context type
3. Backend service/controller — pass-through (minimal)
4. Regenerate API (`pnpm generate-api`) — TSOA picks up new union
5. Frontend helper — extract `buildFormulaAiContext`
6. Frontend hook — new `useConvertSqlToFormula`
7. Migrate existing hook — pass `mode: 'prompt'`
8. Preview component — `FormulaConversionPreview` + CSS module
9. Modal wiring — add button, preview, Apply/Discard
10. Analytics — tracking events + extend generated event
11. Tests — agent unit tests, hook test, component test
