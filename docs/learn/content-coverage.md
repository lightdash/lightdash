# Curriculum coverage contract

Learn offers generated in-app walkthroughs and disabled **Coming Soon** cards.
Reading lessons and their acknowledgment flow have been removed. The catalogue
has 42 walkthrough scope entries (40 distinct click paths) and 21 Coming Soon
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
markers and `scope-tours:generate`; the separate reading generator is removed.

`manage:DeletedContent` uses the project-scoped Recently deleted entry. Its menu
and direct route require the existing DeletedContent ability and soft-delete
flag. The walkthrough restores a chart deleted in the learner's copy. Permanent
deletion is outside this path.

See [walkthrough priorities](walkthrough-priorities.md) for the nine completed
in-app outcomes and their verification evidence.
