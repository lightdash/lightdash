import {
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
});
