import { generateKeyPairSync, sign } from 'crypto';
import LicenseClient from './LicenseClient';

const NOW = Date.parse('2026-08-28T10:00:00.000Z');
const LICENSE_KEY = 'license-key';
const ACCOUNT_ID = '1ae7d3a8-4665-44e4-989d-9de54c84761a';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyHex = Buffer.from(
    (publicKey.export({ format: 'jwk' }) as { x: string }).x,
    'base64url',
).toString('hex');

const validPayload = () => ({
    meta: {
        issued: '2026-08-27T09:00:00.000Z',
        expiry: '2026-09-28T09:00:00.000Z' as string | null,
        ttl: 2678400 as number | null,
    },
    data: {
        id: 'license-id',
        type: 'licenses',
        attributes: {
            key: LICENSE_KEY,
            expiry: '2027-08-28T09:00:00.000Z' as string | null,
            status: 'ACTIVE',
            suspended: false,
        },
        relationships: {
            account: {
                data: {
                    id: ACCOUNT_ID,
                    type: 'accounts',
                },
            },
        },
    },
});

const createLicenseFile = ({
    payload = validPayload(),
    algorithm = 'base64+ed25519',
    validSignature = true,
}: {
    payload?: ReturnType<typeof validPayload>;
    algorithm?: string;
    validSignature?: boolean;
} = {}) => {
    const enc = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = validSignature
        ? sign(null, Buffer.from(`license/${enc}`), privateKey)
        : Buffer.alloc(64);
    const body = Buffer.from(
        JSON.stringify({
            alg: algorithm,
            enc,
            sig: signature.toString('base64'),
        }),
    ).toString('base64');
    const certificate = `-----BEGIN LICENSE FILE-----\n${body}\n-----END LICENSE FILE-----`;

    return Buffer.from(certificate).toString('base64');
};

const validateOffline = (
    encodedCertificate = createLicenseFile(),
    licenseKey = LICENSE_KEY,
) =>
    LicenseClient.validateOfflineLicenseFile({
        encodedCertificate,
        licenseKey,
        publicKeyHex,
        now: NOW,
    });

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('LicenseClient offline validation', () => {
    it('validates a signed license file', () => {
        expect(validateOffline()).toEqual({
            isValid: true,
            detail: 'Offline license file is valid',
            code: 'VALID',
        });
    });

    it('does not fall back online when offline validation fails', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const client = new LicenseClient({
            offlineLicenseCertificate: 'not-base64!',
            validationProxyEnabled: true,
        });

        await expect(client.get(LICENSE_KEY)).rejects.toThrow(
            'LIGHTDASH_LICENSE_CERTIFICATE is not valid base64',
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'a malformed environment value',
            file: 'not-base64!',
            error: 'LIGHTDASH_LICENSE_CERTIFICATE is not valid base64',
        },
        {
            name: 'invalid base64 padding',
            file: 'YWJj===',
            error: 'LIGHTDASH_LICENSE_CERTIFICATE is not valid base64',
        },
        {
            name: 'a malformed certificate',
            file: Buffer.from('not a certificate').toString('base64'),
            error: 'Offline license file certificate is malformed',
        },
        {
            name: 'an unsupported algorithm',
            file: createLicenseFile({ algorithm: 'aes-256-gcm+ed25519' }),
            error: 'Unsupported offline license file algorithm',
        },
        {
            name: 'an invalid signature',
            file: createLicenseFile({ validSignature: false }),
            error: 'Offline license file signature is invalid',
        },
    ])('rejects $name', ({ file, error }) => {
        expect(() => validateOffline(file)).toThrow(error);
    });

    it('rejects a license file for another account', () => {
        const payload = validPayload();
        payload.data.relationships.account.data.id = 'another-account';

        expect(() => validateOffline(createLicenseFile({ payload }))).toThrow(
            'belongs to a different Keygen account',
        );
    });

    it('rejects a license file paired with the wrong key', () => {
        expect(() =>
            validateOffline(createLicenseFile(), 'another-key'),
        ).toThrow('does not match LIGHTDASH_LICENSE_KEY');
    });

    it('rejects a future issue time', () => {
        const payload = validPayload();
        payload.meta.issued = '2026-08-29T09:00:00.000Z';

        expect(() => validateOffline(createLicenseFile({ payload }))).toThrow(
            'issue time is in the future',
        );
    });

    it('rejects an expired certificate', () => {
        const payload = validPayload();
        payload.meta.expiry = '2026-08-28T09:30:00.000Z';

        expect(() => validateOffline(createLicenseFile({ payload }))).toThrow(
            'Offline license file has expired',
        );
    });

    it('rejects a missing TTL', () => {
        const payload = validPayload();
        delete (payload.meta as Partial<typeof payload.meta>).ttl;

        expect(() => validateOffline(createLicenseFile({ payload }))).toThrow(
            'TTL is missing or invalid',
        );
    });

    it('validates a perpetual license file with no TTL', () => {
        const payload = validPayload();
        payload.meta.ttl = null;
        payload.meta.expiry = null;

        expect(validateOffline(createLicenseFile({ payload }))).toEqual({
            isValid: true,
            detail: 'Offline license file is valid',
            code: 'VALID',
        });
    });

    it('rejects a missing expiry', () => {
        const payload = validPayload();
        delete (payload.meta as Partial<typeof payload.meta>).expiry;

        expect(() => validateOffline(createLicenseFile({ payload }))).toThrow(
            'Offline license file expiry is missing',
        );
    });

    it('validates a perpetual license with no expiry', () => {
        const payload = validPayload();
        payload.meta.ttl = null;
        payload.meta.expiry = null;
        payload.data.attributes.expiry = null;

        expect(validateOffline(createLicenseFile({ payload }))).toEqual({
            isValid: true,
            detail: 'Offline license file is valid',
            code: 'VALID',
        });
    });

    it('reports an expired license as invalid without throwing', () => {
        const payload = validPayload();
        payload.data.attributes.expiry = '2026-08-28T09:30:00.000Z';

        expect(validateOffline(createLicenseFile({ payload }))).toEqual({
            isValid: false,
            detail: 'Offline license has expired',
            code: 'EXPIRED',
        });
    });

    it('reports a suspended license as invalid without throwing', () => {
        const payload = validPayload();
        payload.data.attributes.suspended = true;

        expect(validateOffline(createLicenseFile({ payload }))).toEqual({
            isValid: false,
            detail: 'Offline license is suspended',
            code: 'SUSPENDED',
        });
    });

    it('reports a banned license as invalid without throwing', () => {
        const payload = validPayload();
        payload.data.attributes.status = 'BANNED';

        expect(validateOffline(createLicenseFile({ payload }))).toEqual({
            isValid: false,
            detail: 'Offline license is banned',
            code: 'BANNED',
        });
    });
});

describe('LicenseClient online validation', () => {
    it('uses Keygen when no offline license file is configured', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            json: async () => ({
                meta: {
                    valid: true,
                    detail: 'valid',
                    code: 'VALID',
                },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await new LicenseClient({}).get(LICENSE_KEY);

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('api.keygen.sh'),
            expect.any(Object),
        );
    });

    it('uses the Lightdash proxy when enabled without an offline file', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                valid: true,
                detail: 'valid',
                code: 'VALID',
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await new LicenseClient({ validationProxyEnabled: true }).get(
            LICENSE_KEY,
        );

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('roadmap.lightdash.com'),
            expect.any(Object),
        );
    });
});
