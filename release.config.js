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
            '@amanda-mitchell/semantic-release-npm-multiple',
            {
                registries: {
                    main: {
                        npmPublish: false,
                        pkgRoot: '.',
                    },
                    common: {
                        npmPublish: false,
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
                        npmPublish: false,
                        pkgRoot: 'packages/warehouses',
                    },
                    cli: {
                        npmPublish: false,
                        pkgRoot: 'packages/cli',
                    },
                },
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
