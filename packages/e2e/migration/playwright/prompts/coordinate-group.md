# Coordination agent contract

You own one coordination key shared by two or more analyzed Cypress files. Do not port their tests.

## Inputs

- `COORDINATION_KEY`
- Related findings files
- `COORDINATION_FILE`

## Responsibilities

1. Read every related findings file and verify the shared requirement is real.
2. Define the smallest stable contract, ownership boundary, and dependency order.
3. Prefer file-local code unless duplication would be unsafe or materially inconsistent.
4. Decide whether the prerequisite is documentation-only or requires code.
5. Define how every dependent file remains independently green.
6. Define shared-preview/database isolation where mutation is involved.
7. Record unresolved product/test-contract questions explicitly.
8. If code is necessary, implement it on a dedicated branch, verify it, and create a separate signed prerequisite commit only after receiving the signing lease.
9. Never port an assigned Cypress suite in the coordinator change.

Write `COORDINATION_FILE` with: affected files, evidence, decision, contract, owner, dependency graph, verification, rollout order, and unresolved questions. End with `COORDINATION_COMPLETE` or `COORDINATION_BLOCKED`.
