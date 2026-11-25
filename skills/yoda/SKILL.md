---
name: yoda
description: Review a Lightdash PR, branch or diff through lenses, or explain a system, bug or change. /yoda [review|json|explain|triage] [text|json|html|github] [quick|deep] [lens names] <PR(s), topic or question>
disable-model-invocation: true
version: 1795627695
---

# yoda

One quiet answer an engineer reads in three minutes, on their fifteenth review of the day.
Findings first, then the diff; no signal beats weak signal.

## Invocation

```
/yoda [review|json|explain|triage] [text|json|html|github] [quick|deep] [lens names] <PR(s), topic or question>
```

Words go in any order.
Model invocation is off, so another skill runs yoda by reading this file and following it with the same words, for example `review text` for findings it acts on and `review html` for a page the user sees.

- **review:** PRs, branch or local diff; read [review.md](review.md), then its selected lenses, [testing.md](testing.md) and [formats/json.md](formats/json.md).
  For text, HTML or GitHub also read that renderer.
- **json:** changes as data, without checks or findings; read review.md's Gather, Select and Render, testing.md's Coverage-drop Diff, then formats/json.md.
  Alone `json` selects this mode; with `review` it selects the format.
- **explain:** systems, features, questions, tickets, bugs or changes; read [explain.md](explain.md).
  Investigate bugs within this mode; explain changes without judging them.
- **triage:** one PR's detected tags only; read [triage.md](triage.md).

Infer an omitted mode: review for a PR/branch/diff; json when only change data is requested; explain otherwise.
Use triage only when its tag list is wanted.

Formats: **html** (default) is one compact segmented card ([formats/html.md](formats/html.md)), shown inline or published when a shareable link is requested; **text** is Markdown, used where HTML cannot render (a terminal, or another agent reading the review); **json** is data; **github** writes the PR description and keeps it synced ([formats/github.md](formats/github.md)).
A PR whose description holds a yoda block is synced whenever yoda reviews it, whatever the format.
Reformat an existing review from context or its saved JSON in `~/.yoda/reviews/` ([review.md](review.md#save)) without reviewing again.

Depth: **quick** (default) or **deep**, as the mode specifies.
Lens file names (`security`, `live-data-sources`) select lenses directly under triage's selection rules.
Yoda sets neither model nor effort.
`version` above is the Unix epoch of the skill's last edit: set it to `date +%s` whenever any file in this skill changes.

## Copy

- State claims as facts with an actor and action (“Editors curate source fields”).
  Lead with numbers, plain words and the user-visible effect; headlines name the behaviour, not the file.
- Findings show concrete input/output, a changed cell or causal branch, not best-practice advice.
  Compare the same scenario in Before/After.
- Refs and identifiers follow [lenses/README.md](lenses/README.md), Evidence and Public by default.
- Each finding stands alone, and the review covers only what the change touched.
