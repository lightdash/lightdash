/**
 * @type {import('semantic-release').GlobalConfig}
 */

// PROD-8359 kill-switch (see scripts/gen-release-safety.ts). While the marker is
// dark-launched (RELEASE_SAFETY_MARKER_ENABLED !== "true") the generator writes no
// release-safety.json, so we must NOT list it as a GitHub asset — a missing asset
// would risk failing every release. Flipping the env var to "true" both writes the
// file and attaches it, in one switch.
const releaseSafetyMarkerEnabled =
    process.env.RELEASE_SAFETY_MARKER_ENABLED === 'true';

module.exports = {
    branches: [
        '+([0-9])?(.{+([0-9]),x}).x',
        'main',
        'next',
        'next-major',
        { name: 'beta', prerelease: true },
        { name: 'alpha', prerelease: true },
    ],
    plugins: [
        '@semantic-release/commit-analyzer',

        '@semantic-release/release-notes-generator',
        [
            '@semantic-release/changelog',
            {
                changelogFile: 'CHANGELOG.md',
            },
        ],

        [
            '@semantic-release/exec',
            {
                prepareCmd:
                    'npm version ${nextRelease.version} --workspaces --include-workspace-root --allow-same-version --no-git-tag-version 2>&1 | grep -q -E "EUNSUPPORTEDPROTOCOL|Invalid comparator"',
            },
        ],

        [
            '@semantic-release/exec',
            {
                prepareCmd: 'pnpm build-published-packages',
                publishCmd: 'pnpm release-packages',
            },
        ],

        // Generate the release-safety marker (PROD-8359). Runs before the github
        // plugin so the asset exists at publish time. Published asset-only — not
        // committed; the GitHub releases/download/<tag>/release-safety.json URL is
        // already a stable per-version URL for this public repo.
        //
        // --ai-review activates the gated AI migration review (P6). It only fires
        // on the ~10% of releases with migrations, only when the deterministic SQL
        // linter did not already prove a break, and only when ANTHROPIC_API_KEY is
        // set in the release job. Any degrade leaves the honest "unknown" verdict;
        // it never fails the release.
        [
            '@semantic-release/exec',
            {
                prepareCmd:
                    'npx tsx scripts/gen-release-safety.ts --version ${nextRelease.version} --previous-version "${lastRelease.version}" --last-tag "${lastRelease.gitTag}" --out release-safety.json --ai-review',
            },
        ],

        [
            '@semantic-release/git',
            {
                assets: [
                    'CHANGELOG.md',
                    'package.json',
                    'packages/backend/package.json',
                    'packages/cli/package.json',
                    'packages/common/package.json',
                    'packages/e2e/package.json',
                    'packages/frontend/package.json',
                    'packages/warehouses/package.json',
                    'packages/query-sdk/package.json',
                    'packages/frontend/sdk/package.json',
                    // PROD-8359: when the marker generator auto-records this
                    // release's expand/contract upgrade floor, the change to this
                    // committed file ships in the release commit so future releases
                    // carry the floor forward. Unchanged (the common case) → no-op.
                    'release-safety.overrides.json',
                ],
                message:
                    'chore(release): ${nextRelease.version} \n\n${nextRelease.notes}',
            },
        ],
        [
            '@semantic-release/github',
            {
                // Attach the marker only when the kill-switch is on (see above).
                assets: releaseSafetyMarkerEnabled
                    ? [
                          {
                              path: 'release-safety.json',
                              label: 'release-safety.json',
                          },
                      ]
                    : [],
            },
        ],
    ],
    tagFormat: '${version}',
};
