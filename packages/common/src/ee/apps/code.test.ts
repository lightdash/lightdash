import {
    currentDataAppCodeVersion,
    validateDataAppCode,
    type DataAppCode,
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
