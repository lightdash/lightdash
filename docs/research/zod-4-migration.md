# Zod 4 migration research

Research date: 2026-09-01. Target: exact `zod@4.4.3` in common, backend,
and frontend. The latest registry release (`4.5.4`) was rejected by this
repository's minimum-release-age policy; `4.4.3` was already policy-approved
and present in the baseline lockfile as an MCP SDK peer resolution.

## Baseline

After installing the existing frozen lockfile and building the generated
formula parser plus common/warehouses artifacts:

- common targeted tests: 3 files, 61 tests passed
- backend MCP/config tests: 2 files, 246 tests passed
- frontend Mantine form compatibility: 1 file, 1 test passed
- common, backend, and frontend package typechecks: passed

Before the formula build, the backend MCP suite could not load
`formula/src/grammar/parser`; this was missing generated setup, not a test
failure. Before dependency installation, all commands failed before collection.

## Primary-source findings

- Zod 4 unifies schema error customization under `error`, removes
  `invalid_type_error`/`required_error`, removes `ZodError.errors` in favor of
  `issues`, and changes issue types. [Official migration guide](https://zod.dev/v4/changelog#error-customization)
- `z.record` now requires explicit key and value schemas. Enum-keyed records
  are exhaustive; `z.partialRecord` preserves optional enum keys.
  [Official migration guide](https://zod.dev/v4/changelog#zrecord)
- `ZodType` now has output/input generics only; `ZodTypeAny` is unnecessary.
  Internal definitions moved from `_def` to `_zod.def` and are explicitly
  unstable. [Official migration guide](https://zod.dev/v4/changelog#updates-generics)
- Native `z.toJSONSchema` supports draft-07, `io: "input"`, inline reuse, and
  cycle rejection. Shared schema identity is inlined by default; reference
  reuse requires `reused: "ref"`. [Official JSON Schema API](https://zod.dev/json-schema#ztojsonschema)
- Native conversion rejects transforms and other unrepresentable types by
  default. Input-mode conversion is required for tool argument contracts whose
  output schema contains transforms. [Official JSON Schema API](https://zod.dev/json-schema#io)
- Zod's implementation exposes `reused: "inline"` and `cycles: "throw"`; refs
  are extracted for reuse only when requested, while cycles otherwise require
  refs. [Official source](https://github.com/colinhacks/zod/blob/main/packages/zod/src/v4/core/to-json-schema.ts)
- MCP SDK 1.30's first-party source detects Zod 4 and uses native Zod JSON
  Schema conversion in input mode. This makes Zod 4-native, acyclic schemas the
  relevant runtime contract. [Official MCP SDK source](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/server/zod-json-schema-compat.ts)

## Implementation consequences

- Use `.issues`, explicit `z.record(z.string(), value)`, `error`, and Zod 4
  output/input generics everywhere.
- Centralize native draft-07 input-schema conversion with `reused: "inline"`
  and `cycles: "throw"` for first-party MCP/agent JSON Schema generation.
- Rewrite the MCP compatibility layer around Zod 4 helpers/definitions; do not
  clone Zod internals merely to defeat Zod 3 reference detection.
- Expose password requirement messages as a public common contract; the
  frontend must not inspect Zod definitions/check objects.

## Verification

- common: typecheck and lint passed; full suite passed (166 files, 3,969 tests,
  1 skipped)
- backend: typecheck and lint passed; full suite passed (550 files, 9,010 tests,
  1 skipped)
- frontend: typecheck and lint passed; full suite passed (421 files, 3,143
  tests)
- the root workspace test passed all 13 tasks, including common, warehouses,
  CLI, query SDK, backend, and frontend; the workspace production build passed
- all release-safety checks passed
- MCP and agent contract snapshots pass without update mode; the stable MCP
  snapshot check passes and contains no `$ref`
- semantic differential testing covered all 33 MCP tools, recursively comparing
  Zod 3 and Zod 4 input/output JSON Schemas with generated boundary values; the
  shared converter preserves closed input objects and required coerced fields
- agent-tool contract snapshots were audited separately: only closed object
  boundaries and one runtime-optional unknown field changed
- no contract widenings remain; the only sampled narrowings are Zod 4's RFC UUID
  validation and rejection of integers outside JavaScript's safe range
- frozen lockfile installation and supply-chain policy verification pass

## Performance measurements

Measured on the same machine in clean worktrees at the exact merge base
(`fbe9632c`) and final PR commit (`fa12e406`):

| Measurement | Merge base | Zod 4 PR | Change |
| --- | ---: | ---: | ---: |
| Common TypeScript check, median of 6 alternating warm runs | 1.84s | 1.10s | 40% faster |
| Representative valid AI query parse, median | 0.970M ops/s | 5.30M ops/s | 5.47x faster |
| Rejected AI query parse, median | 0.694M ops/s | 0.176M ops/s | 3.94x slower |
| 53-tool agent schema registry construction, median | 3.37ms | 13.81ms | +10.44ms |
| Frontend production build, median of 4 alternating warm runs | 7.56s | 7.87s | +4.1%; within noise |
| Initial frontend payload | 3,054,510 gzip bytes | 3,057,390 gzip bytes | +2,880 bytes (+0.09%) |

The invalid-parse slowdown affects rejected tool calls rather than normal valid
traffic. Registry construction is cold setup work and remains about 14ms in
absolute terms. Frontend build timings have changed direction across repeated
runs, so no build-speed claim is made.

Before locale pruning, the initial payload was 3,085,818 gzip bytes: +31,308
bytes against the merge base. The Vite guard recovers 90.8% of that regression
and fails future builds if unused non-English Zod locales return.
