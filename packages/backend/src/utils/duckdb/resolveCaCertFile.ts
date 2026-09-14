import { existsSync } from 'fs';

/** Where Debian, RHEL, SUSE and macOS keep the system CA bundle. */
export const WELL_KNOWN_CA_BUNDLE_PATHS = [
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/pki/tls/certs/ca-bundle.crt',
    '/etc/ssl/ca-bundle.pem',
    '/etc/ssl/cert.pem',
];

/**
 * The PEM bundle DuckDB's httpfs verifies HTTPS object storage with. Node
 * carries its own trust store, so a container can write results over HTTPS
 * and still have no bundle for httpfs to load; that surfaces as an opaque
 * "SSL CA cert" IO error. An explicit SSL_CERT_FILE that does not exist is
 * reported as missing rather than silently replaced by a well-known path.
 */
export const resolveCaCertFile = ({
    env = process.env,
    exists = existsSync,
}: {
    env?: NodeJS.ProcessEnv;
    exists?: (path: string) => boolean;
} = {}): string | null => {
    const fromEnv = env.SSL_CERT_FILE?.trim();
    if (fromEnv) {
        return exists(fromEnv) ? fromEnv : null;
    }
    return WELL_KNOWN_CA_BUNDLE_PATHS.find((path) => exists(path)) ?? null;
};
