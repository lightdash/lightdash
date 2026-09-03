import {
    resolveCaCertFile,
    WELL_KNOWN_CA_BUNDLE_PATHS,
} from './resolveCaCertFile';

const existsOnly =
    (...present: string[]) =>
    (path: string) =>
        present.includes(path);

describe('resolveCaCertFile', () => {
    test('prefers an existing SSL_CERT_FILE', () => {
        expect(
            resolveCaCertFile({
                env: { SSL_CERT_FILE: '/custom/bundle.pem' },
                exists: existsOnly(
                    '/custom/bundle.pem',
                    WELL_KNOWN_CA_BUNDLE_PATHS[0],
                ),
            }),
        ).toBe('/custom/bundle.pem');
    });

    test('reports a missing SSL_CERT_FILE instead of falling back', () => {
        expect(
            resolveCaCertFile({
                env: { SSL_CERT_FILE: '/custom/missing.pem' },
                exists: existsOnly(WELL_KNOWN_CA_BUNDLE_PATHS[0]),
            }),
        ).toBeNull();
    });

    test('finds the first well-known bundle that exists', () => {
        expect(
            resolveCaCertFile({
                env: {},
                exists: existsOnly(WELL_KNOWN_CA_BUNDLE_PATHS[2]),
            }),
        ).toBe(WELL_KNOWN_CA_BUNDLE_PATHS[2]);
    });

    test('is null when no bundle exists', () => {
        expect(resolveCaCertFile({ env: {}, exists: () => false })).toBeNull();
    });
});
