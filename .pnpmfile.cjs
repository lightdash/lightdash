// INFO: this is needed to install both Mantine v8 and v6 in the same project!
// code taken from https://gist.github.com/dvins/33b8fb52480149d37cdeb98890244c5b

// https://pnpm.io/pnpmfile
// https://github.com/pnpm/pnpm/issues/4214
// https://github.com/pnpm/pnpm/issues/5391

// TypeScript 7 has a new API; isolate tools that still require the legacy API.
const LEGACY_TYPESCRIPT_API_VERSION = '5.9.3';

const legacyTypeScriptApiPackages = new Set([
    '@joshwooding/vite-plugin-react-docgen-typescript',
    'cosmiconfig',
    'react-docgen-typescript',
    'rollup-plugin-dts',
    'ts-api-utils',
    'ts-node',
    'ts-unused-exports',
]);

const remapPeerDependencies = [
    {
        package: '@mantine/core',
        packageVersion: '8.0.0',
        peerDependency: '@mantine/hooks',
        newVersion: '8.0.0',
    },
    {
        package: '@mantine/notifications',
        packageVersion: '8.0.0',
        peerDependency: '@mantine/core',
        newVersion: '8.0.0',
    },
    {
        package: '@mantine/notifications',
        packageVersion: '8.0.0',
        peerDependency: '@mantine/hooks',
        newVersion: '8.0.0',
    },
    {
        package: '@mantine/modals',
        packageVersion: '8.0.0',
        peerDependency: '@mantine/core',
        newVersion: '8.0.0',
    },
    {
        package: '@mantine/modals',
        packageVersion: '8.0.0',
        peerDependency: '@mantine/hooks',
        newVersion: '8.0.0',
    },
    {
        package: '@mantine/tiptap',
        packageVersion: '8.0.0',
        peerDependency: '@mantine/core',
        newVersion: '8.0.0',
    },
    {
        package: '@mantine/tiptap',
        packageVersion: '8.0.0',
        peerDependency: '@mantine/hooks',
        newVersion: '8.0.0',
    },
    {
        package: '@mantine/code-highlight',
        packageVersion: '8.0.0',
        peerDependency: '@mantine/core',
        newVersion: '8.0.0',
    },
    {
        package: '@mantine/code-highlight',
        packageVersion: '8.0.0',
        peerDependency: '@mantine/hooks',
        newVersion: '8.0.0',
    },
    {
        package: 'echarts-for-react',
        packageVersion: '3.0.1',
        peerDependency: 'echarts',
        newVersion: '6.0.0',
    },
];

function overridesPeerDependencies(pkg) {
    if (pkg.peerDependencies) {
        if (
            (pkg.peerDependencies.typescript ||
                pkg.peerDependenciesMeta?.typescript) &&
            (pkg.name.startsWith('@typescript-eslint/') ||
                legacyTypeScriptApiPackages.has(pkg.name))
        ) {
            pkg.dependencies ??= {};
            pkg.dependencies.typescript = LEGACY_TYPESCRIPT_API_VERSION;
            delete pkg.peerDependencies.typescript;
            delete pkg.peerDependenciesMeta?.typescript;
        }

        remapPeerDependencies.map((dep) => {
            if (
                pkg.name === dep.package &&
                pkg.version.startsWith(dep.packageVersion)
            ) {
                // make it yellow
                console.info(
                    '\x1b[33m%s\x1b[0m',
                    `⚠︎ Patching ${dep.package} ${dep.packageVersion} dependencies`,
                );

                console.info(`- Checking ${pkg.name}@${pkg.version}`); // , pkg.peerDependencies);

                if (dep.peerDependency in pkg.peerDependencies) {
                    console.info(
                        `  - Overriding ${pkg.name}@${
                            pkg.version
                        } peerDependency ${dep.peerDependency}@${
                            pkg.peerDependencies[dep.peerDependency]
                        }`,
                    );

                    // First add a new dependency to the package and then remove the peer dependency.
                    // This approach has the added advantage that scoped overrides should now work, too.
                    pkg.dependencies[dep.peerDependency] = dep.newVersion;
                    delete pkg.peerDependencies[dep.peerDependency];

                    console.info(
                        `    - Applied override ${pkg.name}@${
                            pkg.version
                        } peerDependency ${dep.peerDependency}@${
                            pkg.dependencies[dep.peerDependency]
                        }`,
                    );
                    console.info('\n');
                }
            }
        });
    }
}

module.exports = {
    hooks: {
        readPackage(pkg, _context) {
            overridesPeerDependencies(pkg);
            return pkg;
        },
    },
};
