# Content as code

## Review

- **Skip when:** a regenerated JSON schema alone, or AI writeback of dbt YAML (AI Agent).
- **Worst case:** a round trip loses or changes content, or a deploy overwrites someone's edits.
- **Evidence:** do a download, edit and upload round trip, and read the format diff.
- **round trip:** download then upload leaves content unchanged, new fields included.
- **no silent overwrite:** deploy and promotion say what they will replace, and keep content the user didn't include.
- **schema regenerated:** a format change comes with a regenerated JSON schema.
- **references resolve:** chart, space and field references survive moving between projects.
- **schemas in step:** a semantic-layer field change updates the dbt schema and the model-as-code schema together.

## Impact

- **breaking:** removed/renamed keys or narrowed types reject old files.
- **notable:** new key.
- **minor:** widened type.

## Diff

```ts
type ContentAsCodeDiff = Diff & {
    file: string;  // the file it lives in, kebab-case, as its users name it (`dashboard`, `agent`, `dbt-model`)
    type: string;  // the value type; "old → new" when modified
};
```

- **Name:** the exact YAML path (`config.controlOrder`, `meta.pre_aggregates[].refresh.on_change`).
- **Granularity:** one diff per key users write.
  A new list or map gets its own diff, and so does each key users write inside it.
  A new file type is one `added` diff naming its main keys in the note, not a row per key.
  A rename is `modified` with `old → new` in `name`.

```json
{ "lens": "Content as code", "change": "added", "impact": "notable", "name": "config.controlOrder", "file": "dashboard", "type": "list", "note": "keeps the filter control order on upload" }
```
