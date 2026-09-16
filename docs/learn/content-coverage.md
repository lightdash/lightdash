# Curriculum coverage contract

Learn offers generated in-app walkthroughs and disabled **Coming Soon** cards.
Reading acknowledgments do not count as completed walkthroughs. The catalogue
has 41 walkthrough scope entries (39 distinct click paths) and 24 Coming Soon
scope entries, explicitly listed in `features/learn/comingSoon.ts`.

The coverage audit reconciles `getTrainingProjectScopes()`, the explicit analytics
and agent-document obligations, generated `SCOPE_TOURS`, and dispositions in
`scripts/scope-tours/coverage.ts`. It does not change permission grants. Modifier
variants such as `@self` and `@space` are omitted, matching the catalogue.

| Category | Meaning | Blocks release |
| --- | --- | --- |
| `generated` | A walkthrough exists under this exact scope key | No |
| `comingSoon` | An explicit unsupported module, shown as Coming Soon | No |
| `related` | Another tour is relevant, but this permission's outcome is unverified | Yes |
| `pending` | An unapproved content or prerequisite gap | Yes |
| `excluded` | A documented baseline/background permission or absent product surface | No |
| `unclassified` | A scope has neither a walkthrough nor a disposition | Yes |

Coming Soon is the product decision confirmed on 2026-09-10: unsupported modules
remain visible while new interactive delivery formats are designed in separate
tickets. They are not counted as generated content, completed learning, or
available recommendations. There are five explicit exclusions for background
permissions and absent surfaces. Removing a walkthrough without an explicit
disposition still fails the audit.

The strict release audit rejects pending, related, unclassified, stale, and
invalid dispositions. Only explicitly listed Coming Soon entries may ship as
unsupported modules. New tickets for delivery formats have not been created by
this change; CS-212 remains the parent curriculum reference.

Run from the repository root with the pinned Node version:

```sh
pnpm scope-tours:coverage
pnpm scope-tours:coverage:test
pnpm scope-tours:release-check
```

Generated content presence does not certify browser execution, teaching quality,
seed availability, or training-copy isolation. Those require separate checks.
Canonical documentation still supplies walkthrough prose through frontend
markers and `scope-tours:generate`; no separate reading generator is required.

`manage:DeletedContent` is Coming Soon. Its walkthrough reached Recently deleted
through a Browse menu entry and standalone route added for Learn without a
product decision; both were removed. CS-311 tracks agreeing an entry point with
product before the walkthrough returns.

See [walkthrough priorities](walkthrough-priorities.md) for the in-app outcomes
and their verification requirements.
