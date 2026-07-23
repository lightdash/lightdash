import {
    LightdashError,
    ParameterError,
    type DataAppCodeDownload,
} from '@lightdash/common';
import {
    appsDownloadSummary,
    capListedApps,
    classifyAppDownloadError,
    classifyAppUpload,
    computeUpsertedTotal,
    DEFAULT_APPS_LIMIT,
    ensureDownloadedAppContext,
    getDataAppUploadFilter,
    getDataAppUuidFromReference,
    manifestRetargetHint,
    resolveAppsLimit,
    selectAppsToDownload,
    shouldFallBackToSpaceScopedListing,
    shouldWarnAllSkipped,
} from './appsDownload';

describe('getDataAppUuidFromReference', () => {
    const appUuid = 'd3afc44c-6f0f-4d9f-a267-fb739efa31dd';
    const projectUuid = 'd4c8dfd2-98c0-4eb2-8395-d924aee62611';

    it('keeps a bare app UUID unchanged', () => {
        expect(getDataAppUuidFromReference(appUuid)).toBe(appUuid);
    });

    it.each([
        `https://app.lightdash.cloud/projects/${projectUuid}/apps/${appUuid}`,
        `https://app.lightdash.cloud/projects/${projectUuid}/apps/${appUuid}/view`,
        `https://app.lightdash.cloud/projects/${projectUuid}/apps/${appUuid}/versions/2/view?state=filters#preview`,
        `https://app.lightdash.cloud/embed/${projectUuid}/app/${appUuid}`,
    ])('extracts the app UUID from %s', (url) => {
        expect(getDataAppUuidFromReference(url)).toBe(appUuid);
    });

    it.each([
        'my-app',
        `https://app.lightdash.cloud/${appUuid}`,
        `https://app.lightdash.cloud/projects/${projectUuid}/apps/generate`,
        `ftp://app.lightdash.cloud/projects/${projectUuid}/apps/${appUuid}`,
    ])('leaves unsupported references unchanged: %s', (reference) => {
        expect(getDataAppUuidFromReference(reference)).toBe(reference);
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
    it('returns explicit uuids without listing when uuids are passed', () => {
        expect(selectAppsToDownload({ apps: ['uuid-a', 'uuid-b'] })).toEqual({
            mode: 'explicit',
            appUuids: ['uuid-a', 'uuid-b'],
        });
    });

    it('lists all apps when --include-apps is passed', () => {
        expect(selectAppsToDownload({ includeApps: true })).toEqual({
            mode: 'list-all',
            extraAppUuids: [],
        });
    });

    it('combines --include-apps with explicitly passed uuids', () => {
        expect(
            selectAppsToDownload({ apps: ['uuid-a'], includeApps: true }),
        ).toEqual({ mode: 'list-all', extraAppUuids: ['uuid-a'] });
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
            appUuids: ['d3afc44c-6f0f-4d9f-a267-fb739efa31dd'],
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

describe('classifyAppUpload', () => {
    it('proceeds when createNew is true regardless of project mismatch', () => {
        expect(classifyAppUpload('proj-a', 'proj-b', true)).toBe('proceed');
    });

    it('proceeds when manifest project matches target project', () => {
        expect(classifyAppUpload('proj-a', 'proj-a', false)).toBe('proceed');
    });

    it('needs-confirmation when projects differ and createNew is false', () => {
        expect(classifyAppUpload('proj-a', 'proj-b', false)).toBe(
            'needs-confirmation',
        );
    });
});

describe('manifestRetargetHint', () => {
    it('names both uuids, the consequence, and the manual fix', () => {
        const hint = manifestRetargetHint({
            folder: 'my-app',
            appUuid: 'new-app-uuid',
            projectUuid: 'target-proj-uuid',
        });
        expect(hint).toContain('my-app/lightdash-app.yml');
        expect(hint).toContain('appUuid: new-app-uuid');
        expect(hint).toContain('projectUuid: target-proj-uuid');
        expect(hint).toMatch(/ask to create again/i);
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
            [{ appUuid: 'uuid-a', message: 'server exploded' }],
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
            [{ appUuid: 'uuid-a', message: 'server exploded' }],
            '/tmp/x/apps',
            1,
        );
        expect(summary.ok).toBe(false);
        expect(summary.message).toContain('Downloaded 1 of 2 data app(s)');
        expect(summary.message).toContain('1 skipped: no built version');
        expect(summary.message).toContain('1 failed');
    });
});
