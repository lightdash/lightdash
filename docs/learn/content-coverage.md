# Curriculum coverage contract

The coverage audit reconciles the base permissions returned by
`getTrainingProjectScopes()` plus the explicit analytics and agent-document obligations with generated
`SCOPE_TOURS`, `CONCEPT_LESSONS`, and explicit curriculum
dispositions in `scripts/scope-tours/coverage.ts`. The audit does not change permission grants or lesson runtime behavior. Modifier variants such as
`@self` and `@space` are omitted, matching `buildLearnCatalogue()`.

Run from the repository root with the pinned Node version:

```sh
pnpm scope-tours:coverage
pnpm scope-tours:coverage:test
pnpm scope-tours:release-check
```

The pure `auditCoverage` function accepts scopes, available lesson keys, dispositions,
and a strict-mode boolean. Its report keeps these categories separate:

| Category | Meaning | Blocks release |
| --- | --- | --- |
| `generated` | A generated walkthrough or concept lesson exists under this exact scope key | No |
| `related` | Another tour is relevant, but teaching this permission's action is unverified | Yes |
| `pending` | Content, prerequisites, or a format decision is outstanding | Yes |
| `excluded` | An explicit reason documents a baseline/background permission or absent product surface | No |
| `unclassified` | A base permission has neither a direct tour nor a disposition | Yes |

`generated` measures generated content presence, including reading lessons. It does not certify successful
browser execution, accurate teaching, seed data, or training-copy isolation; those
require separate checks. In particular, the create-virtual-view lesson does not
prove managing or deleting a virtual view.

The release audit is a structural coverage gate; generation, content checks, and
browser smoke verification remain required.

The normal audit allows documented pending and related work. Both normal and
release audits fail for unclassified scopes, stale dispositions (a removed scope
or a newly available direct lesson), unavailable referenced tours, or dispositions
without a reason and ticket. `--release` additionally fails for pending and related
work. A release failure must be resolved with content or an evidenced curriculum
decision; dropping a card is not completion.

The release catalogue contains 33 walkthroughs and 30 concept entries. Five
baseline/background permissions or absent product surfaces have explicit
exclusions. These are not placeholder modules. CI runs the strict release audit,
so removing a lesson without an evidenced disposition fails even if the library
would otherwise hide the missing card.

CLI, embedding, promotion, validation, and other workflows that cannot safely be
practised in a training copy use documentation lessons. Reading completion is
explicitly acknowledged and does not certify performing an action. Analytics
(CS-232) and agent knowledge documents (CS-238) are explicit content obligations
outside the training permission set; providing their lessons grants no access.

Canonical documentation supplies the generated prose. Run
`pnpm scope-tours:concepts:test` and, with `LIGHTDASH_DOCS_DIR` set,
`pnpm scope-tours:concepts:check` to verify extraction and source freshness.
Documentation changes must merge before dependent generated content. The two
metrics-tree walkthroughs additionally require the seeded saved tree and its
project-local metric identifiers in each training copy.

The prior CS-222 exclusion is superseded: `manage:DeletedContent` now has a
Recently deleted product page and documentation, so the curriculum teaches its
restoration and permanent-deletion workflow as a reading lesson. Exclusions are
rechecked against current source rather than inferred from canceled tickets.
