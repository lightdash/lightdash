import { type DataAppCodeDownload } from '@lightdash/common';
import {
    appsDownloadSummary,
    capListedApps,
    classifyAppUpload,
    computeUpsertedTotal,
    ensureDownloadedAppContext,
    manifestRetargetHint,
    MAX_INCLUDE_APPS,
    selectAppsToDownload,
    shouldWarnAllSkipped,
} from './appsDownload';

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

    it('skips apps when neither flag is passed', () => {
        expect(selectAppsToDownload({})).toEqual({ mode: 'none' });
        expect(selectAppsToDownload({ apps: [] })).toEqual({ mode: 'none' });
    });
});

describe('capListedApps', () => {
    it('keeps all listed apps when under the cap', () => {
        expect(capListedApps(['a', 'b', 'c'])).toEqual({
            appUuids: ['a', 'b', 'c'],
            truncatedCount: 0,
        });
    });

    it(`caps listed apps at ${MAX_INCLUDE_APPS} and reports the truncated count`, () => {
        const listed = Array.from({ length: 12 }, (_, i) => `uuid-${i}`);
        const result = capListedApps(listed);
        expect(result.appUuids).toHaveLength(MAX_INCLUDE_APPS);
        expect(result.appUuids).toEqual(listed.slice(0, MAX_INCLUDE_APPS));
        expect(result.truncatedCount).toBe(2);
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

describe('appsDownloadSummary', () => {
    it('reports success when all apps downloaded', () => {
        const summary = appsDownloadSummary(2, 2, [], '/tmp/x/apps');
        expect(summary.ok).toBe(true);
        expect(summary.message).toContain('Downloaded 2 of 2 data app(s)');
        expect(summary.message).toContain('/tmp/x/apps');
        expect(summary.failureLines).toEqual([]);
    });

    it('reports a warning with per-app reasons when any app failed', () => {
        const summary = appsDownloadSummary(
            0,
            1,
            [{ appUuid: 'uuid-a', message: 'server exploded' }],
            '/tmp/x/apps',
        );
        expect(summary.ok).toBe(false);
        expect(summary.message).toContain('Downloaded 0 of 1 data app(s)');
        expect(summary.message).toContain('1 failed');
        expect(summary.failureLines).toHaveLength(1);
        expect(summary.failureLines[0]).toContain('uuid-a');
        expect(summary.failureLines[0]).toContain('server exploded');
    });
});
