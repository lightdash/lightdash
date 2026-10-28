# Release-safety declarations

`Release-safety preview` is a required check on `main`. It protects self-hosted upgrades: `unknown` means we could not confirm the change is safe, while `breaking` means we know it is incompatible. Both hold the upgrade, for different reasons.

- For migration breaks, follow the detailed [migration release-safety declarations](../packages/backend/src/database/migrations/CLAUDE.md#release-safety-declarations).
- For API or type breaks, add a stable ID to `release-safety.declarations.json` with `reason` and `requiredStop`. The reason must be at least 24 characters, use more than one word, describe what breaks and for whom, and not use placeholder text. Omit `migration` for these entries.

For REST or MCP changes with no external callers, add an advisory declaration:

- Use it only for a surface behind a feature flag that is off by default, or called only by a Lightdash client.
- Set `requiredStop: false`. Add `impact: { "kind": "no-external-callers", "featureFlag": "agent-identity", "covers": { "rest": ["DELETE /api/v2/example/{exampleUuid}"], "mcp": [] } }`. Use a `FeatureFlags` enum value, not its key. List exact REST operations or MCP tool names in `covers`.
- Supply exactly one evidence field: `featureFlag` or a substantive `firstPartyOnly` statement that names the only Lightdash client.
- With `featureFlag`, the reason must say whether the flag is off by default on Cloud and on self-hosted. Off by default is a reviewed claim; release-safety checks that the flag exists, not its defaults or endpoint gating.
- With `firstPartyOnly`, the reason must say what an old UI pod, browser tab or client sees during a rolling update. For example: "the old settings page shows an error until refresh". Explain why the accepted behaviour is safe.
- Advisories keep covered API findings rolling-safe. They never cover migrations, config changes or required stops. The author and reviewer accept the no-external-callers claim; release-safety does not verify it.

For an environment variable the backend stops reading, add it to `release-safety.retired-config.json` as `"NAME": "reason"`. The config diff then reports that removal as retired instead of breaking. Use it only for a variable no operator relies on: undocumented, or internal to an experiment. The reason must say who set it and why nothing breaks without it. The file is append-only.

A declaration is active only for a Git range that adds its ID. The release generator compares the last release tag with the target ref. The pull request preview compares the merge base with the head. This makes the declaration expire after the release that first contains it. Do not remove it after release.

The registry is append-only. Never edit, remove, rename, or reuse an existing ID. Add a new ID for every new break, even when it affects the same file or has similar reason text. A release may add `releasedIn` for documentation, but that value never controls activation.

Never declare a break merely to make CI pass. Declaring a break advises every self-hosted customer to use the Recreate strategy. A release that ships as `breaking` or `unknown` stops the internal analytics instance upgrading. The declaration does not reactivate in later Git ranges.
