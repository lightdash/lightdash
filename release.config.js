// order is important
const packagesWithWorkspaceDependencies = [
    'packages/backend/package.json',
    'packages/cli/package.json',
    'packages/e2e/package.json',
    'packages/frontend/package.json',
    'packages/warehouses/package.json',
];

// order is important and should be in sync with `packagesWithWorkspaceDependencies`
const expectedResults = [
    {
        file: 'packages/backend/package.json',
        hasChanged: true,
        numMatches: 2,
        numReplacements: 2,
    },
    {
        file: 'packages/cli/package.json',
        hasChanged: true,
        numMatches: 2,
        numReplacements: 2,
    },
    {
        file: 'packages/e2e/package.json',
        hasChanged: true,
        numMatches: 1,
        numReplacements: 1,
    },
    {
        file: 'packages/frontend/package.json',
        hasChanged: true,
        numMatches: 1,
        numReplacements: 1,
    },
    {
        file: 'packages/warehouses/package.json',
        hasChanged: true,
        numMatches: 1,
        numReplacements: 1,
    },
];

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
            '@google/semantic-release-replace-plugin',
            {
                replacements: [
                    {
                        files: packagesWithWorkspaceDependencies,
                        from: 'workspace:\\*',
                        to: '^${nextRelease.version}',
                        countMatches: true,
                        results: expectedResults,
                    },
                ],
            },
        ],

        [
            '@amanda-mitchell/semantic-release-npm-multiple',
            {
                registries: {
                    main: {
                        npmPublish: false,
                        pkgRoot: '.',
                    },
                    common: {
                        npmPublish: true,
                        pkgRoot: 'packages/common',
                    },
                    backend: {
                        npmPublish: false,
                        pkgRoot: 'packages/backend',
                    },
                    frontend: {
                        npmPublish: false,
                        pkgRoot: 'packages/frontend',
                    },
                    e2e: {
                        npmPublish: false,
                        pkgRoot: 'packages/e2e',
                    },
                    warehouses: {
                        npmPublish: true,
                        pkgRoot: 'packages/warehouses',
                    },
                    cli: {
                        npmPublish: true,
                        pkgRoot: 'packages/cli',
                    },
                },
            },
        ],

        [
            '@google/semantic-release-replace-plugin',
            {
                replacements: [
                    {
                        files: packagesWithWorkspaceDependencies,
                        from: (_file, { nextRelease: { version } }) => {
                            const regexVersion = version.replace(/\./g, '\\.');
                            return new RegExp(`\\^${regexVersion}`, 'gm');
                        },
                        to: 'workspace:*',
                        countMatches: true,
                        results: expectedResults,
                    },
                ],
            },
        ],

        [
            '@semantic-release/git',
            {
                assets: [
                    'CHANGELOG.md',
                    'package.json',
                    'packages/common/package.json',
                    ...packagesWithWorkspaceDependencies,
                ],
                message:
                    'chore(release): ${nextRelease.version} \n\n${nextRelease.notes}',
            },
        ],
        ['@semantic-release/github', {}],
    ],
    tagFormat: '${version}',
};
