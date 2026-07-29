import {
    buildManifest,
    contentTypeForPath,
    relPathToS3Key,
    s3KeyToRelPath,
    versionPrefix,
} from './appCode';

describe('appCode helpers', () => {
    it('builds the version prefix', () => {
        expect(versionPrefix('a', 2)).toBe('apps/a/versions/2/');
    });
    it('round-trips an s3 key and a rel path', () => {
        const prefix = versionPrefix('a', 2);
        expect(s3KeyToRelPath('apps/a/versions/2/assets/x.js', prefix)).toBe(
            'assets/x.js',
        );
        expect(relPathToS3Key('assets/x.js', prefix)).toBe(
            'apps/a/versions/2/assets/x.js',
        );
    });
    it('maps content types', () => {
        expect(contentTypeForPath('index.html')).toBe('text/html');
        expect(contentTypeForPath('assets/x.js')).toMatch(/javascript/);
        expect(contentTypeForPath('source.tar')).toBe('application/x-tar');
    });
    it('includes the slug in the built manifest alongside the fixed code version', () => {
        const manifest = buildManifest({
            appUuid: 'app-uuid-1234',
            slug: 'my-app',
            projectUuid: 'project-uuid-5678',
            version: 1,
            name: 'My App',
            description: 'A test app',
            template: null,
            downloadedAt: '2024-01-01T00:00:00.000Z',
        });

        expect(manifest.slug).toBe('my-app');
        expect(manifest.codeVersion).toBe(1);
    });
});
