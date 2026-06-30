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
});
