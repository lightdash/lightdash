/**
 * @type {import('semantic-release').GlobalConfig}
 */
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
                    'packages/frontend/sdk/package.json',
                ],
                message:
                    'chore(release): ${nextRelease.version} \n\n${nextRelease.notes}',
            },
        ],
        ['@semantic-release/github', {}],
    ],
    tagFormat: '${version}',
};
