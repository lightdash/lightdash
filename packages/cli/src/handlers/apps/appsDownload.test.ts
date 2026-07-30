import {
    LightdashError,
    ParameterError,
    type AnyType,
    type DataAppCodeDownload,
    type DataAppManifest,
} from '@lightdash/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    appsDownloadSummary,
    capListedApps,
    classifyAppDownloadError,
    computeUpsertedTotal,
    DEFAULT_APPS_LIMIT,
    downloadAppsToDir,
    ensureDownloadedAppContext,
    getDataAppReference,
    getDataAppUploadFilter,
    matchedUploadRefs,
    preSlugServerHint,
    preSlugUploadHint,
    resolveAppsLimit,
    selectAppsToDownload,
    shouldFallBackToSpaceScopedListing,
    shouldWarnAllSkipped,
    unmatchedUploadRefsWarning,
    uploadFilterMatches,
} from './appsDownload';

describe('getDataAppReference', () => {
    const appUuid = 'd3afc44c-6f0f-4d9f-a267-fb739efa31dd';
    const projectUuid = 'd4c8dfd2-98c0-4eb2-8395-d924aee62611';

    it('keeps a bare app UUID unchanged', () => {
        expect(getDataAppReference(appUuid)).toBe(appUuid);
    });

    it('keeps a bare slug unchanged', () => {
        expect(getDataAppReference('my-app-slug')).toBe('my-app-slug');
    });

    it.each([
        `https://app.lightdash.cloud/projects/${projectUuid}/apps/${appUuid}`,
        `https://app.lightdash.cloud/projects/${projectUuid}/apps/${appUuid}/view`,
        `https://app.lightdash.cloud/projects/${projectUuid}/apps/${appUuid}/versions/2/view?state=filters#preview`,
        `https://app.lightdash.cloud/embed/${projectUuid}/app/${appUuid}`,
    ])('extracts the app UUID from %s', (url) => {
        expect(getDataAppReference(url)).toBe(appUuid);
    });

    it.each([
        'my-app',
        `https://app.lightdash.cloud/${appUuid}`,
        `https://app.lightdash.cloud/projects/${projectUuid}/apps/generate`,
        `ftp://app.lightdash.cloud/projects/${projectUuid}/apps/${appUuid}`,
    ])('leaves unsupported references unchanged: %s', (reference) => {
        expect(getDataAppReference(reference)).toBe(reference);
    });
});

describe('uploadFilterMatches', () => {
    const makeManifest = (
        overrides: Partial<DataAppManifest> = {},
    ): DataAppManifest => ({
        codeVersion: 1 as const,
        appUuid: 'app-uuid-1',
        projectUuid: 'proj-uuid-1',
        version: 3,
        name: 'My App',
        description: '',
        template: null,
        downloadedAt: '2026-06-25T00:00:00.000Z',
        ...overrides,
    });

    it('matches everything when the filter is null', () => {
        expect(uploadFilterMatches(null, makeManifest())).toBe(true);
    });

    it('matches on manifest.appUuid', () => {
        const filter = new Set(['app-uuid-1']);
        expect(uploadFilterMatches(filter, makeManifest())).toBe(true);
    });

    it('matches on manifest.slug', () => {
        const filter = new Set(['sales-app']);
        expect(
            uploadFilterMatches(filter, makeManifest({ slug: 'sales-app' })),
        ).toBe(true);
    });

    it('does not match when neither uuid nor slug is in the filter', () => {
        const filter = new Set(['other-uuid']);
        expect(
            uploadFilterMatches(filter, makeManifest({ slug: 'sales-app' })),
        ).toBe(false);
    });

    it('matches only by uuid when the manifest has no slug', () => {
        const filter = new Set(['app-uuid-1']);
        expect(
            uploadFilterMatches(filter, makeManifest({ slug: undefined })),
        ).toBe(true);
        expect(
            uploadFilterMatches(
                new Set(['sales-app']),
                makeManifest({ slug: undefined }),
            ),
        ).toBe(false);
    });

    it('matches only by slug for uuid-free manifests (slug-aware servers)', () => {
        const manifest = makeManifest({
            appUuid: undefined,
            slug: 'sales-app',
        });
        expect(uploadFilterMatches(new Set(['sales-app']), manifest)).toBe(
            true,
        );
        expect(uploadFilterMatches(new Set(['app-uuid-1']), manifest)).toBe(
            false,
        );
        expect(uploadFilterMatches(null, manifest)).toBe(true);
    });
});

describe('getDataAppUploadFilter', () => {
    const appUuid = 'd3afc44c-6f0f-4d9f-a267-fb739efa31dd';

    it('matches app manifests by UUID when a URL is passed', () => {
        expect(
            getDataAppUploadFilter(
                [
                    `https://app.lightdash.cloud/projects/project-uuid/apps/${appUuid}/view`,
                ],
                false,
            ),
        ).toEqual(new Set([appUuid]));
    });

    it('does not filter app folders when --include-apps is passed', () => {
        expect(getDataAppUploadFilter([appUuid], true)).toBeNull();
    });
});

const makeDownload = (): DataAppCodeDownload =>
    ({
        manifest: {
            codeVersion: 1 as const,
            appUuid: 'app-uuid-1',
            projectUuid: 'proj-uuid-1',
            version: 3,
            name: 'My App',
            description: '',
            template: null,
            downloadedAt: '2026-06-25T00:00:00.000Z',
        },
        files: [],
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
    }) as DataAppCodeDownload;

describe('selectAppsToDownload', () => {
    it('returns explicit refs without listing when refs are passed', () => {
        expect(selectAppsToDownload({ apps: ['uuid-a', 'uuid-b'] })).toEqual({
            mode: 'explicit',
            appRefs: ['uuid-a', 'uuid-b'],
        });
    });

    it('lists all apps when --include-apps is passed', () => {
        expect(selectAppsToDownload({ includeApps: true })).toEqual({
            mode: 'list-all',
            extraAppRefs: [],
        });
    });

    it('combines --include-apps with explicitly passed refs', () => {
        expect(
            selectAppsToDownload({ apps: ['uuid-a'], includeApps: true }),
        ).toEqual({ mode: 'list-all', extraAppRefs: ['uuid-a'] });
    });

    it('normalizes explicit app URLs without listing apps', () => {
        expect(
            selectAppsToDownload({
                apps: [
                    'https://app.lightdash.cloud/projects/project-uuid/apps/d3afc44c-6f0f-4d9f-a267-fb739efa31dd/view',
                ],
            }),
        ).toEqual({
            mode: 'explicit',
            appRefs: ['d3afc44c-6f0f-4d9f-a267-fb739efa31dd'],
        });
    });

    it('skips apps when neither flag is passed', () => {
        expect(selectAppsToDownload({})).toEqual({ mode: 'none' });
        expect(selectAppsToDownload({ apps: [] })).toEqual({ mode: 'none' });
    });
});

describe('capListedApps', () => {
    it('keeps all listed apps when under the limit', () => {
        expect(capListedApps(['a', 'b', 'c'], 5)).toEqual({
            appUuids: ['a', 'b', 'c'],
            truncatedCount: 0,
        });
    });

    it('caps listed apps at the given limit and reports the truncated count', () => {
        const listed = Array.from({ length: 12 }, (_, i) => `uuid-${i}`);
        const result = capListedApps(listed, 10);
        expect(result.appUuids).toHaveLength(10);
        expect(result.appUuids).toEqual(listed.slice(0, 10));
        expect(result.truncatedCount).toBe(2);
    });

    it('reports no truncation when exactly at the limit', () => {
        expect(capListedApps(['a', 'b'], 2)).toEqual({
            appUuids: ['a', 'b'],
            truncatedCount: 0,
        });
    });
});

describe('resolveAppsLimit', () => {
    it('defaults to DEFAULT_APPS_LIMIT when the flag is not passed', () => {
        expect(DEFAULT_APPS_LIMIT).toBe(50);
        expect(resolveAppsLimit(undefined, true)).toEqual({
            limit: DEFAULT_APPS_LIMIT,
            noEffectWarning: null,
        });
    });

    it('does not warn when the flag is not passed, even without --include-apps', () => {
        expect(resolveAppsLimit(undefined, false)).toEqual({
            limit: DEFAULT_APPS_LIMIT,
            noEffectWarning: null,
        });
    });

    it('parses an explicit limit', () => {
        expect(resolveAppsLimit('200', true)).toEqual({
            limit: 200,
            noEffectWarning: null,
        });
    });

    it('warns (but succeeds) when passed without --include-apps', () => {
        const result = resolveAppsLimit('5', false);
        expect(result.limit).toBe(5);
        expect(result.noEffectWarning).toContain('--include-apps');
    });

    it.each(['0', '-5', 'abc', '1.5', ''])(
        'rejects %p as a ParameterError',
        (raw) => {
            expect(() => resolveAppsLimit(raw, true)).toThrow(ParameterError);
        },
    );
});

describe('shouldFallBackToSpaceScopedListing', () => {
    const makeError = (statusCode: number) =>
        new LightdashError({
            message: 'x',
            name: 'TestError',
            statusCode,
            data: {},
        });

    it('falls back when the listing endpoint 404s (older server)', () => {
        expect(shouldFallBackToSpaceScopedListing(makeError(404))).toBe(true);
    });

    it('propagates 403 (data apps disabled) instead of falling back', () => {
        expect(shouldFallBackToSpaceScopedListing(makeError(403))).toBe(false);
    });

    it('propagates non-Lightdash errors', () => {
        expect(shouldFallBackToSpaceScopedListing(new Error('boom'))).toBe(
            false,
        );
    });
});

describe('ensureDownloadedAppContext', () => {
    it('returns the code unchanged when context is present', () => {
        const code = makeDownload();
        expect(ensureDownloadedAppContext('app-uuid-1', code)).toBe(code);
    });

    it('throws an actionable error when the server response has no context (old server)', () => {
        const code = makeDownload();
        const { context, ...withoutContext } = code;
        expect(() =>
            ensureDownloadedAppContext(
                'app-uuid-1',
                withoutContext as DataAppCodeDownload,
            ),
        ).toThrow(/does not support app context downloads/i);
    });
});

describe('preSlugUploadHint', () => {
    it('suggests adding the slug to lightdash-app.yml when the server returned one', () => {
        const hint = preSlugUploadHint({
            folder: 'lightdash/apps/my-app',
            slug: 'my-app',
        });
        expect(hint).toContain('lightdash/apps/my-app/lightdash-app.yml');
        expect(hint).toContain('predates slug identity');
        expect(hint).toContain('add `slug: my-app` to lightdash-app.yml');
        expect(hint).toContain('Uploads keep working via uuid matching');
    });

    it('omits the add-slug suggestion when the server did not return a slug', () => {
        const hint = preSlugUploadHint({
            folder: 'lightdash/apps/my-app',
            slug: undefined,
        });
        expect(hint).toContain('lightdash/apps/my-app/lightdash-app.yml');
        expect(hint).toContain('predates slug identity');
        expect(hint).not.toContain('add `slug:');
        expect(hint).toContain('Uploads keep working via uuid matching');
    });
});

describe('matchedUploadRefs', () => {
    const manifest = {
        codeVersion: 1 as const,
        appUuid: 'app-uuid-1',
        projectUuid: 'proj-uuid-1',
        slug: 'sales-app',
        version: 3,
        name: 'My App',
        description: '',
        template: null,
        downloadedAt: '2026-07-29T00:00:00.000Z',
    };

    it('returns the filter entries the manifest satisfies', () => {
        expect(
            matchedUploadRefs(
                new Set(['app-uuid-1', 'sales-app', 'other']),
                manifest,
            ),
        ).toEqual(['app-uuid-1', 'sales-app']);
    });

    it('returns only the slug for uuid-free manifests', () => {
        expect(
            matchedUploadRefs(new Set(['app-uuid-1', 'sales-app']), {
                ...manifest,
                appUuid: undefined,
            }),
        ).toEqual(['sales-app']);
    });
});

describe('unmatchedUploadRefsWarning', () => {
    it('returns null when everything matched', () => {
        expect(unmatchedUploadRefsWarning([])).toBeNull();
    });

    it('lists unmatched refs', () => {
        const warning = unmatchedUploadRefsWarning(['sales-ap']);
        expect(warning).toContain('No local app folder matched: sales-ap.');
        expect(warning).not.toContain('slug identity');
    });

    it('adds the slug-identity explanation for uuid-shaped refs', () => {
        const warning = unmatchedUploadRefsWarning([
            'd3afc44c-6f0f-4d9f-a267-fb739efa31dd',
        ]);
        expect(warning).toContain('carry no uuid');
        expect(warning).toContain('select them by slug');
    });
});

describe('preSlugServerHint', () => {
    it('warns that the server matched by uuid only and to check for duplicates', () => {
        const hint = preSlugServerHint('my-app');
        expect(hint).toContain('"my-app"');
        expect(hint).toContain('predates slug-based app identity');
        expect(hint).toContain('verify no duplicate was created');
    });
});

describe('computeUpsertedTotal', () => {
    it('sums only keys that are neither skipped nor failed', () => {
        const changes = {
            'charts created': 2,
            'charts skipped': 3,
            'charts failed': 1,
            'dashboards updated': 4,
        };
        expect(computeUpsertedTotal(changes)).toBe(6); // 2 + 4
    });

    it('returns 0 when all keys are skipped or failed', () => {
        const changes = {
            'charts skipped': 5,
            'data apps failed': 1,
        };
        expect(computeUpsertedTotal(changes)).toBe(0);
    });

    it('returns 0 for empty changes', () => {
        expect(computeUpsertedTotal({})).toBe(0);
    });
});

describe('shouldWarnAllSkipped', () => {
    it('returns true when everything was skipped', () => {
        expect(shouldWarnAllSkipped({ 'charts skipped': 3 })).toBe(true);
    });

    it('returns false when some content was upserted', () => {
        expect(
            shouldWarnAllSkipped({
                'charts skipped': 3,
                'data apps created': 1,
            }),
        ).toBe(false);
    });

    it('returns false when only failures exist (no skipped)', () => {
        expect(shouldWarnAllSkipped({ 'data apps failed': 1 })).toBe(false);
    });

    it('returns false when nothing was skipped', () => {
        expect(shouldWarnAllSkipped({ 'charts created': 2 })).toBe(false);
    });

    it('returns false for empty changes', () => {
        expect(shouldWarnAllSkipped({})).toBe(false);
    });
});

describe('classifyAppDownloadError', () => {
    const make404 = (message: string) =>
        new LightdashError({
            message,
            name: 'NotFoundError',
            statusCode: 404,
            data: {},
        });

    it('skips apps that have no built version yet', () => {
        expect(
            classifyAppDownloadError(
                make404('Data app has no ready version yet: uuid-a'),
            ),
        ).toEqual({ kind: 'skip-not-built' });
    });

    it('passes the server message through for other 404s', () => {
        expect(classifyAppDownloadError(make404('App not found'))).toEqual({
            kind: 'fail',
            message: 'App not found',
        });
    });

    it('falls back to a canned explanation only when a 404 has no server message', () => {
        const outcome = classifyAppDownloadError(make404(''));
        expect(outcome.kind).toBe('fail');
        if (outcome.kind === 'fail') {
            expect(outcome.message).toContain('data apps');
        }
    });

    it('passes the server message through for non-404 Lightdash errors', () => {
        const err = new LightdashError({
            message: 'Data apps are not enabled',
            name: 'ForbiddenError',
            statusCode: 403,
            data: {},
        });
        expect(classifyAppDownloadError(err)).toEqual({
            kind: 'fail',
            message: 'Data apps are not enabled',
        });
    });

    it('fails with the error message for plain errors', () => {
        expect(classifyAppDownloadError(new Error('boom'))).toEqual({
            kind: 'fail',
            message: 'boom',
        });
    });
});

describe('appsDownloadSummary', () => {
    it('reports success when all apps downloaded', () => {
        const summary = appsDownloadSummary(2, 2, [], '/tmp/x/apps', 0);
        expect(summary.ok).toBe(true);
        expect(summary.message).toContain('Downloaded 2 of 2 data app(s)');
        expect(summary.message).toContain('/tmp/x/apps');
        expect(summary.message).not.toContain('skipped');
        expect(summary.failureLines).toEqual([]);
    });

    it('reports a warning with per-app reasons when any app failed', () => {
        const summary = appsDownloadSummary(
            0,
            1,
            [{ appRef: 'uuid-a', message: 'server exploded' }],
            '/tmp/x/apps',
            0,
        );
        expect(summary.ok).toBe(false);
        expect(summary.message).toContain('Downloaded 0 of 1 data app(s)');
        expect(summary.message).toContain('1 failed');
        expect(summary.failureLines).toHaveLength(1);
        expect(summary.failureLines[0]).toContain('uuid-a');
        expect(summary.failureLines[0]).toContain('server exploded');
    });

    it('excludes skipped apps from the attempted count and stays ok', () => {
        const summary = appsDownloadSummary(41, 50, [], '/tmp/x/apps', 9);
        expect(summary.ok).toBe(true);
        expect(summary.message).toContain('Downloaded 41 of 41 data app(s)');
        expect(summary.message).toContain('9 skipped: no built version');
        expect(summary.failureLines).toEqual([]);
    });

    it('reports skips and failures together', () => {
        const summary = appsDownloadSummary(
            1,
            3,
            [{ appRef: 'uuid-a', message: 'server exploded' }],
            '/tmp/x/apps',
            1,
        );
        expect(summary.ok).toBe(false);
        expect(summary.message).toContain('Downloaded 1 of 2 data app(s)');
        expect(summary.message).toContain('1 skipped: no built version');
        expect(summary.message).toContain('1 failed');
    });
});

describe('downloadAppsToDir', () => {
    const tmpDir = () =>
        fs.mkdtempSync(path.join(os.tmpdir(), 'ld-apps-download-'));

    const codeFor = (slug: string): AnyType => ({
        manifest: {
            codeVersion: 1,
            projectUuid: 'project-uuid',
            slug,
            version: 1,
            name: slug,
            description: '',
            template: null,
            downloadedAt: '2026-07-30T00:00:00.000Z',
        },
        files: [
            {
                path: 'src/App.tsx',
                contentBase64: Buffer.from(
                    'export default () => null;',
                ).toString('base64'),
            },
        ],
        context: {
            semanticLayer: {
                path: '.lightdash/context/semantic-layer.yml',
                contentBase64: Buffer.from('models: []').toString('base64'),
            },
            parameters: null,
            promptHistory: {
                path: '.lightdash/context/prompt-history.md',
                contentBase64: Buffer.from('# history').toString('base64'),
            },
            theme: { instructions: null, assets: [], skippedAssetCount: 0 },
        },
    });

    it('writes one folder per app and counts successes', async () => {
        const appsDir = tmpDir();
        const outcome = await downloadAppsToDir({
            appRefs: ['revenue-explorer'],
            projectId: 'project-uuid',
            appsDir,
            takenFolders: new Set(),
            cliVersion: '0.0.0-test',
            fetchApp: async (_p, ref) => codeFor(ref),
        });

        expect(outcome).toEqual({
            successCount: 1,
            skippedNotBuiltCount: 0,
            failures: [],
        });
        expect(
            fs.existsSync(
                path.join(appsDir, 'revenue-explorer', 'lightdash-app.yml'),
            ),
        ).toBe(true);
    });

    it('writes server-provided dependencies over the scaffold template package.json', async () => {
        const appsDir = tmpDir();
        const packageJson = JSON.stringify({
            name: 'server-provided',
            dependencies: {},
        });
        const lockfile = 'lockfileVersion: 6.0\nserver: provided\n';

        const outcome = await downloadAppsToDir({
            appRefs: ['deps-app'],
            projectId: 'project-uuid',
            appsDir,
            takenFolders: new Set(),
            cliVersion: '0.0.0-test',
            fetchApp: async (_p, ref) => ({
                ...codeFor(ref),
                dependencies: { packageJson, lockfile },
            }),
        });

        expect(outcome.successCount).toBe(1);
        const writtenPackageJson = fs.readFileSync(
            path.join(appsDir, 'deps-app', 'package.json'),
            'utf-8',
        );
        expect(writtenPackageJson).toBe(packageJson);
        const writtenLockfile = fs.readFileSync(
            path.join(appsDir, 'deps-app', 'pnpm-lock.yaml'),
            'utf-8',
        );
        expect(writtenLockfile).toBe(lockfile);
    });

    it('counts an app with no ready version as skipped, not failed', async () => {
        const outcome = await downloadAppsToDir({
            appRefs: ['half-built'],
            projectId: 'project-uuid',
            appsDir: tmpDir(),
            takenFolders: new Set(),
            cliVersion: '0.0.0-test',
            fetchApp: async () => {
                throw new LightdashError({
                    message: 'App has no ready version to download',
                    name: 'NotFoundError',
                    statusCode: 404,
                    data: {},
                });
            },
        });

        expect(outcome.skippedNotBuiltCount).toBe(1);
        expect(outcome.failures).toEqual([]);
    });
});
