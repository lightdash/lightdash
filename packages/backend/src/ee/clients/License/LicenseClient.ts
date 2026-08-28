import { UnexpectedServerError } from '@lightdash/common';
import { createPublicKey, verify } from 'crypto';

type LicenseValidationError = {
    title: string;
    detail: string;
    code?: string;
    source?: unknown;
};

type KeygenLicenceResponse = {
    meta?: {
        ts: string; // "2021-03-15T19:27:50.440Z",
        valid: boolean;
        detail: string;
        code: string;
        scope?: unknown;
    };
    data?: unknown;
    errors?: LicenseValidationError[];
};

type ProxyLicenceResponse = {
    valid?: boolean;
    detail?: string;
    code?: string;
    licenseId?: string;
    errors?: LicenseValidationError[];
};

type License = {
    isValid: boolean;
    detail: string;
    code: string;
    cachedTimestamp?: number;
};

type OfflineLicenseFile = {
    alg: string;
    enc: string;
    sig: string;
};

type OfflineLicensePayload = {
    meta: {
        issued: string;
        expiry: string | null;
        ttl: number | null;
    };
    data: {
        id: string;
        type: string;
        attributes: {
            key: string;
            expiry: string | null;
            status: string;
            suspended: boolean;
        };
        relationships: {
            account: {
                data: {
                    id: string;
                    type: string;
                };
            };
        };
    };
};

const DEFAULT_CACHE_EXPIRATION_MS = 1000 * 60 * 60 * 24; // 24 hours
const KEYGEN_VALIDATION_URL =
    'https://api.keygen.sh/v1/accounts/1ae7d3a8-4665-44e4-989d-9de54c84761a/licenses/actions/validate-key';
const LICENSE_VALIDATION_PROXY_URL =
    'https://roadmap.lightdash.com/api/v1/licenses/validate';
const KEYGEN_ACCOUNT_ID = '1ae7d3a8-4665-44e4-989d-9de54c84761a';
const KEYGEN_ED25519_PUBLIC_KEY =
    '2981a7d7daed3ffb01bdc9d9a35f8d41d6b789d66f5dc3353f55b5c72851e5b1';
const OFFLINE_LICENSE_ALGORITHM = 'base64+ed25519';
const LICENSE_FILE_HEADER = '-----BEGIN LICENSE FILE-----';
const LICENSE_FILE_FOOTER = '-----END LICENSE FILE-----';

type LicenseClientArgs = {
    cacheExpirationInMs?: number;
    validationProxyEnabled?: boolean;
    offlineLicenseCertificate?: string;
};

const decodeBase64 = (value: string, label: string): Buffer => {
    const normalized = value.replace(/\s/g, '');
    const decoded = Buffer.from(normalized, 'base64');
    const roundTrip = decoded.toString('base64').replace(/=+$/, '');

    if (
        normalized.length === 0 ||
        roundTrip !== normalized.replace(/=+$/, '')
    ) {
        throw new UnexpectedServerError(`${label} is not valid base64`);
    }

    return decoded;
};

const parseJson = <T>(value: string, label: string): T => {
    try {
        return JSON.parse(value) as T;
    } catch {
        throw new UnexpectedServerError(`${label} is not valid JSON`);
    }
};

const parseDate = (value: unknown, label: string): number => {
    if (typeof value !== 'string') {
        throw new UnexpectedServerError(`${label} is missing`);
    }

    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
        throw new UnexpectedServerError(`${label} is invalid`);
    }

    return timestamp;
};

const getCertificateBody = (certificate: string): string => {
    const normalized = certificate.trim().replace(/\r\n/g, '\n');
    if (
        !normalized.startsWith(`${LICENSE_FILE_HEADER}\n`) ||
        !normalized.endsWith(`\n${LICENSE_FILE_FOOTER}`)
    ) {
        throw new UnexpectedServerError(
            'Offline license file certificate is malformed',
        );
    }

    return normalized
        .slice(LICENSE_FILE_HEADER.length, -LICENSE_FILE_FOOTER.length)
        .trim();
};

const getEd25519PublicKey = (publicKeyHex: string) => {
    if (!/^[a-f0-9]{64}$/.test(publicKeyHex)) {
        throw new UnexpectedServerError(
            'Offline license public key is invalid',
        );
    }
    const publicKey = Buffer.from(publicKeyHex, 'hex');

    return createPublicKey({
        key: {
            kty: 'OKP',
            crv: 'Ed25519',
            x: publicKey.toString('base64url'),
        },
        format: 'jwk',
    });
};

export default class LicenseClient {
    private cachedLicenses: Map<string, Required<License>> = new Map();

    private readonly cacheExpirationInMs: number = DEFAULT_CACHE_EXPIRATION_MS;

    private readonly validationProxyEnabled: boolean;

    private readonly offlineLicenseCertificate: string | undefined;

    constructor(args: LicenseClientArgs) {
        this.cacheExpirationInMs =
            args.cacheExpirationInMs || DEFAULT_CACHE_EXPIRATION_MS;
        this.validationProxyEnabled = args.validationProxyEnabled ?? false;
        this.offlineLicenseCertificate = args.offlineLicenseCertificate;
    }

    private async validate(key: string): Promise<License> {
        if (this.offlineLicenseCertificate) {
            return LicenseClient.validateOfflineLicenseFile({
                encodedCertificate: this.offlineLicenseCertificate,
                licenseKey: key,
            });
        }

        if (this.validationProxyEnabled) {
            return LicenseClient.validateWithProxy(key);
        }

        return LicenseClient.validateWithKeygen(key);
    }

    private static async validateWithKeygen(key: string): Promise<License> {
        const validation = await fetch(KEYGEN_VALIDATION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                meta: {
                    key,
                },
            }),
        });

        const { meta, errors } =
            (await validation.json()) as KeygenLicenceResponse;

        if (errors?.length) {
            throw new UnexpectedServerError(
                errors.map((e) => e.detail).join(', '),
            );
        }

        if (!meta) {
            throw new UnexpectedServerError(
                'License validation response metadata not found',
            );
        }

        return {
            isValid: meta.valid,
            detail: meta.detail,
            code: meta.code,
        };
    }

    private static async validateWithProxy(key: string): Promise<License> {
        const validation = await fetch(LICENSE_VALIDATION_PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ key }),
        });

        const body = (await validation
            .json()
            .catch(() => null)) as ProxyLicenceResponse | null;

        if (!validation.ok) {
            const reason =
                body?.errors?.map((error) => error.detail).join(', ') ||
                body?.detail ||
                validation.statusText;
            throw new UnexpectedServerError(
                `License validation request failed with status ${validation.status}: ${reason}`,
            );
        }

        if (!body) {
            throw new UnexpectedServerError(
                'License validation response is not valid JSON',
            );
        }

        const { valid, detail, code, errors } = body;

        if (errors?.length) {
            throw new UnexpectedServerError(
                errors.map((error) => error.detail).join(', '),
            );
        }

        if (
            typeof valid !== 'boolean' ||
            typeof detail !== 'string' ||
            typeof code !== 'string'
        ) {
            throw new UnexpectedServerError(
                'License validation response is invalid',
            );
        }

        return {
            isValid: valid,
            detail,
            code,
        };
    }

    public async get(key: string): Promise<License> {
        const cachedLicense = this.cachedLicenses.get(key);
        const now = Date.now();

        if (cachedLicense) {
            const isExpired =
                now - cachedLicense.cachedTimestamp > this.cacheExpirationInMs;

            if (!isExpired) {
                return cachedLicense;
            }

            // If expired, remove from cache
            this.cachedLicenses.delete(key);
        }

        const license = await this.validate(key);
        this.cachedLicenses.set(key, {
            ...license,
            cachedTimestamp: now,
        });

        return license;
    }

    public static validateOfflineLicenseFile({
        encodedCertificate,
        licenseKey,
        publicKeyHex = KEYGEN_ED25519_PUBLIC_KEY,
        now = Date.now(),
    }: {
        encodedCertificate: string;
        licenseKey: string;
        publicKeyHex?: string;
        now?: number;
    }): License {
        const certificate = decodeBase64(
            encodedCertificate,
            'LIGHTDASH_LICENSE_CERTIFICATE',
        ).toString('utf8');
        const certificateBody = getCertificateBody(certificate);
        const licenseFile = parseJson<OfflineLicenseFile>(
            decodeBase64(
                certificateBody,
                'Offline license file certificate',
            ).toString('utf8'),
            'Offline license file certificate',
        );

        if (licenseFile === null || typeof licenseFile !== 'object') {
            throw new UnexpectedServerError(
                'Offline license file certificate is malformed',
            );
        }
        if (licenseFile.alg !== OFFLINE_LICENSE_ALGORITHM) {
            throw new UnexpectedServerError(
                `Unsupported offline license file algorithm: ${licenseFile.alg}`,
            );
        }
        if (
            typeof licenseFile.enc !== 'string' ||
            typeof licenseFile.sig !== 'string'
        ) {
            throw new UnexpectedServerError(
                'Offline license file certificate is malformed',
            );
        }

        const signature = decodeBase64(
            licenseFile.sig,
            'Offline license file signature',
        );
        const isAuthentic = verify(
            null,
            Buffer.from(`license/${licenseFile.enc}`),
            getEd25519PublicKey(publicKeyHex),
            signature,
        );
        if (!isAuthentic) {
            throw new UnexpectedServerError(
                'Offline license file signature is invalid',
            );
        }

        const payload = parseJson<OfflineLicensePayload>(
            decodeBase64(
                licenseFile.enc,
                'Offline license file payload',
            ).toString('utf8'),
            'Offline license file payload',
        );
        if (payload === null || typeof payload !== 'object') {
            throw new UnexpectedServerError(
                'Offline license file payload is malformed',
            );
        }
        const issuedAt = parseDate(
            payload.meta?.issued,
            'Offline license file issue time',
        );
        const { ttl, expiry } = payload.meta;

        // A certificate checked out with a null TTL never expires, and Keygen
        // pairs that with a null expiry.
        if (
            ttl !== null &&
            (typeof ttl !== 'number' || !Number.isFinite(ttl) || ttl <= 0)
        ) {
            throw new UnexpectedServerError(
                'Offline license file TTL is missing or invalid',
            );
        }
        if (!Object.hasOwn(payload.meta, 'expiry')) {
            throw new UnexpectedServerError(
                'Offline license file expiry is missing',
            );
        }
        if (issuedAt > now) {
            throw new UnexpectedServerError(
                'Offline license file issue time is in the future',
            );
        }
        if (
            expiry !== null &&
            parseDate(expiry, 'Offline license file expiry') <= now
        ) {
            throw new UnexpectedServerError('Offline license file has expired');
        }
        if (payload.data?.type !== 'licenses') {
            throw new UnexpectedServerError(
                'Offline license file does not contain a license',
            );
        }
        if (
            payload.data.relationships?.account?.data?.type !== 'accounts' ||
            payload.data.relationships.account.data.id !== KEYGEN_ACCOUNT_ID
        ) {
            throw new UnexpectedServerError(
                'Offline license file belongs to a different Keygen account',
            );
        }
        if (payload.data.attributes?.key !== licenseKey) {
            throw new UnexpectedServerError(
                'Offline license file does not match LIGHTDASH_LICENSE_KEY',
            );
        }

        const { attributes } = payload.data;
        if (
            typeof attributes.status !== 'string' ||
            typeof attributes.suspended !== 'boolean' ||
            !Object.hasOwn(attributes, 'expiry')
        ) {
            throw new UnexpectedServerError(
                'Offline license file payload is malformed',
            );
        }

        // Like the online path, a merely expired or revoked license falls back
        // to Community Edition rather than stopping the server from starting.
        const licenseExpiry = attributes.expiry;
        if (
            licenseExpiry !== null &&
            parseDate(licenseExpiry, 'Offline license expiry') <= now
        ) {
            return {
                isValid: false,
                detail: 'Offline license has expired',
                code: 'EXPIRED',
            };
        }
        if (attributes.suspended) {
            return {
                isValid: false,
                detail: 'Offline license is suspended',
                code: 'SUSPENDED',
            };
        }
        if (['BANNED', 'EXPIRED', 'SUSPENDED'].includes(attributes.status)) {
            return {
                isValid: false,
                detail: `Offline license is ${attributes.status.toLowerCase()}`,
                code: attributes.status,
            };
        }

        return {
            isValid: true,
            detail: 'Offline license file is valid',
            code: 'VALID',
        };
    }
}
