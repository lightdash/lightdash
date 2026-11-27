# JSON

Canonical review schema for every renderer.
Output one fenced `json` object, two-space indentation, with nothing around it; saved files contain the bare object.
Reformatting reuses this data.

Fields are in output order; omit inapplicable optional fields, retain empty arrays.

```ts
type Review = {
    subject: string;               // plain-language claim, ≤12 words
    summary: string;               // what changed and why it matters, ≤25 words; no findings
    repo: string;                  // owner/repo
    pr?: number;                   // one PR, even inside a stack; otherwise branch
    branch?: string;
    base?: string;                 // branch/local only
    head: string;                  // short sha; "+<checksum>" for a dirty worktree
    author: string;
    verdict: "approve" | "approve with notes" | "request changes";
    findings: { lens: string; state: "fix" | "heads-up"; markdown: string }[];
    testing: {
        rating: "enough" | "thin" | "missing";
        rows: { kind: "gap" | "verification"; what: string; how: string }[];
    };
    diffs: Diff[];                 // every lens and coverage-drop row, minor included
    added: number;                 // lines added (git diff --numstat), files triage doesn't skip, tests included
    deleted: number;               // lines deleted, counted the same way
    version: number;               // SKILL.md version: Unix epoch of the skill's last edit
};
```

- **Sources:** verdict per [review.md](../review.md#verdict); testing per [testing.md](../testing.md).
- **Impact:** not stored; renderers show the highest diff impact ([lenses/README.md](../lenses/README.md#impact)), or `none` with no diffs.
- **Finding markdown:** as [review.md](../review.md#render) writes it.
- **Diff:** [Base Diff](../lenses/README.md#base-diff) fields, then the lens's extras in its type's order, then note; coverage drops from [testing.md](../testing.md#coverage-drop-diff).
- **Ordering:** findings by state (Fix first), then triage lens order, then more changed lines first; Testing findings and coverage diffs sort after Observability and before Tooling. Testing rows: gaps, then verification. Diffs follow Base Diff ordering.
- **Standalone json mode:** no lens ran checks, so omit verdict, findings and testing.

```json
{
  "subject": "People can attach screenshots to AI chat",
  "summary": "AI chat accepts pasted screenshots, stores them in S3 and sends them with the message, behind the ai-thread-images flag.",
  "repo": "lightdash/lightdash",
  "pr": 32203,
  "head": "e78c7aa",
  "author": "octocat",
  "verdict": "approve with notes",
  "findings": [],
  "testing": {
    "rating": "thin",
    "rows": [{ "kind": "gap", "what": "replay against real S3", "how": "mocked" }]
  },
  "diffs": [{ "lens": "Config", "change": "added", "impact": "notable", "name": "ai-thread-images", "kind": "flag", "default": "off", "note": "kept off in previews" }],
  "added": 6900,
  "deleted": 1120,
  "version": 1795701619
}
```
