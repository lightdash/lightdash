# Element references in iteration prompts

> Read this when the prompt contains bracketed element references like `[button "Save" @src/components/Toolbar.tsx:42]`.

The Lightdash preview pane has an "Inspect" toggle. When the user clicks an
element in the live preview, the chat editor inserts a bracketed reference at
the textarea cursor. Users can stack multiple references in a single prompt
to compose several targeted edits at once:

```
[button "Save" @src/components/Toolbar.tsx:42] make this blue
[div "$2.4M" @src/Dashboard.tsx:88] rename to Net Revenue
[h3 "Q1 Dashboard" @src/Dashboard.tsx:14] tighter spacing
```

Each line targets one element. Resolve each reference, edit only that
component, and move on. The instruction immediately follows the reference
on the same line (a colon between them is optional — users may include
one).

### Format

A reference always starts with the rendered tag, optionally followed by a
visible-text hint, optionally followed by `@<path>:<line>`:

| Form | Example | Meaning |
|---|---|---|
| `[<tag> "<text>" @<path>:<line>]` | `[button "Save" @src/components/Toolbar.tsx:42]` | Build-time loc available — primary case. |
| `[<tag> @<path>:<line>]` | `[svg @src/Dashboard.tsx:88]` | Element had no text (icon button, empty container) but a loc is available — open the file at that line. |
| `[<tag> "<text>"]` *(no `@…`)* | `[button "Save"]` | Loc unavailable (DOM node injected outside JSX, or pre-transform build). Fall back to grepping the text. |

The `<tag>` is the **rendered** HTML tag (`button`, `h3`, `div`, `span`,
`svg`), not the React component name. shadcn `<Button>` renders as `<button>`,
`<CardTitle>` as `<h3>`, `<Card>` as `<div>`. Keep that in mind when reading
references — the source uses the React component name.

### Resolution strategy

1. **`@<path>:<line>` is authoritative.** It's stamped at build time on the
   user-facing call site (props spread through shadcn primitives, so the
   caller's loc wins over the primitive's own loc). Open that file at that
   line — that is the component to edit. No grep needed.
2. **No `@…` segment** — fall back to text:
   - Grep `/app/src/` for the quoted text. It's almost always hardcoded JSX.
     Inner double quotes are normalized to single quotes in the label, so
     grep both forms if needed.
   - Narrow by tag if multiple matches.
3. **Scope edits to the matched component.** Don't refactor neighbors unless
   the requested change requires it.

### When you can't resolve a reference

If grep returns no hits, the file at the given loc doesn't have anything
matching the text/tag, or the matches are too ambiguous to choose between,
say so and ask the user to clarify or re-select. Don't guess and edit the
wrong component — the user will see the wrong thing change and lose trust
in the tool.
