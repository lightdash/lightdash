import { type DataAppCode } from '@lightdash/common';
import { buildImportBody, isTerminalStatus } from './upload';

const makeCode = (appUuid: string, projectUuid: string): DataAppCode => ({
    manifest: {
        codeVersion: 1 as const,
        appUuid,
        projectUuid,
        version: 3,
        name: 'My App',
        description: '',
        template: null,
        downloadedAt: '2026-06-25T00:00:00.000Z',
    },
    files: [],
});

describe('buildImportBody', () => {
    it('sets targetAppUuid from manifest when uploading to the same project', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {});
        expect(body.targetAppUuid).toBe('app-uuid-1');
    });

    it('leaves targetAppUuid undefined when uploading to a different project', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-OTHER', {});
        expect(body.targetAppUuid).toBeUndefined();
    });

    it('uses --app option regardless of project match', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {
            app: 'explicit-app-uuid',
        });
        expect(body.targetAppUuid).toBe('explicit-app-uuid');
    });

    it('uses --app option even when project differs', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-OTHER', {
            app: 'explicit-app-uuid',
        });
        expect(body.targetAppUuid).toBe('explicit-app-uuid');
    });

    it('passes spaceUuid when --space is provided', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {
            space: 'space-uuid-1',
        });
        expect(body.spaceUuid).toBe('space-uuid-1');
    });

    it('leaves spaceUuid undefined when --space is not provided', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {});
        expect(body.spaceUuid).toBeUndefined();
    });

    it('includes the full code bundle in the body', () => {
        const code = makeCode('app-uuid-1', 'proj-uuid-1');
        const body = buildImportBody(code, 'proj-uuid-1', {});
        expect(body.code).toBe(code);
    });
});

describe('isTerminalStatus', () => {
    it('returns true for ready', () => {
        expect(isTerminalStatus('ready')).toBe(true);
    });

    it('returns true for error', () => {
        expect(isTerminalStatus('error')).toBe(true);
    });

    it('returns false for building', () => {
        expect(isTerminalStatus('building')).toBe(false);
    });

    it('returns false for pending', () => {
        expect(isTerminalStatus('pending')).toBe(false);
    });

    it('returns false for sandbox', () => {
        expect(isTerminalStatus('sandbox')).toBe(false);
    });

    it('returns false for generating', () => {
        expect(isTerminalStatus('generating')).toBe(false);
    });

    it('returns false for packaging', () => {
        expect(isTerminalStatus('packaging')).toBe(false);
    });
});
