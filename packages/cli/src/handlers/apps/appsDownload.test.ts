import { type DataAppCodeDownload } from '@lightdash/common';
import {
    appsDownloadSummary,
    ensureDownloadedAppContext,
    selectAppsToDownload,
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
        const selection = selectAppsToDownload(['uuid-a', 'uuid-b']);
        expect(selection).toEqual({
            mode: 'explicit',
            appUuids: ['uuid-a', 'uuid-b'],
        });
    });

    it('lists all apps when the flag is passed with no uuids', () => {
        expect(selectAppsToDownload(true)).toEqual({ mode: 'list-all' });
        expect(selectAppsToDownload([])).toEqual({ mode: 'list-all' });
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
