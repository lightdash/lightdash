# Curriculum coverage contract

The coverage audit reconciles the base permissions returned by
`getTrainingProjectScopes()` with generated `SCOPE_TOURS` and explicit curriculum
dispositions in `scripts/scope-tours/coverage.ts`. It does not change permission
grants, catalogue cards, or lesson runtime behavior. Modifier variants such as
`@self` and `@space` are omitted, matching `buildLearnCatalogue()`.

Run from the repository root with the pinned Node version:

```sh
pnpm scope-tours:coverage
pnpm scope-tours:coverage:test
pnpm scope-tours:release-check
```

The pure `auditCoverage` function accepts scopes, available tour keys, dispositions,
and a strict-mode boolean. Its report keeps these categories separate:

| Category | Meaning | Blocks release |
| --- | --- | --- |
| `generated` | A generated tour exists under this exact scope key | No |
| `related` | Another tour is relevant, but teaching this permission's action is unverified | Yes |
| `pending` | Content, prerequisites, or a format decision is outstanding | Yes |
| `excluded` | An explicit reason documents a baseline/background permission or absent product surface | No |
| `unclassified` | A base permission has neither a direct tour nor a disposition | Yes |

`generated` measures generated content presence. It does not certify successful
browser execution, accurate teaching, seed data, or training-copy isolation; those
require separate checks. In particular, the create-virtual-view lesson does not
prove managing or deleting a virtual view.

The release audit is a structural coverage gate; generation, content checks, and
browser smoke verification remain required.

The normal audit allows documented pending and related work. Both normal and
release audits fail for unclassified scopes, stale dispositions (a removed scope
or a newly available direct tour), unavailable referenced tours, or dispositions
without a reason and ticket. `--release` additionally fails for pending and related
work. A release failure must be resolved with content or an evidenced curriculum
decision; dropping a card is not completion.

Dispositions derive from the [CS-212 catalogue](https://linear.app/lightdash/issue/CS-212)
and its child-ticket evidence audited on 2026-09-08. Embed and CLI/API scopes await
format decisions. Promotion awaits training-copy semantics. Metrics trees,
validation, and Spotlight configuration retain their documented prerequisites.
Related scope groupings are deliberately conservative until actual lesson steps
prove the promised action. Remove a disposition when its direct tour is generated.

This audit cannot discover content requests outside the current training permission
set. [Usage analytics](https://linear.app/lightdash/issue/CS-232) and
[agent knowledge documents](https://linear.app/lightdash/issue/CS-238) require a
separate permission-boundary decision and remain outside its denominator.
