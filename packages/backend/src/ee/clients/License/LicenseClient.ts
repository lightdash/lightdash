import { UnexpectedServerError } from '@lightdash/common';

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

const DEFAULT_CACHE_EXPIRATION_MS = 1000 * 60 * 60 * 24; // 24 hours
const KEYGEN_VALIDATION_URL =
    'https://api.keygen.sh/v1/accounts/1ae7d3a8-4665-44e4-989d-9de54c84761a/licenses/actions/validate-key';
const LICENSE_VALIDATION_PROXY_URL =
    'https://roadmap.lightdash.com/api/v1/licenses/validate';

type LicenseClientArgs = {
    cacheExpirationInMs?: number;
    validationProxyEnabled?: boolean;
};

export default class LicenseClient {
    private cachedLicenses: Map<string, Required<License>> = new Map();

    private readonly cacheExpirationInMs: number = DEFAULT_CACHE_EXPIRATION_MS;

    private readonly validationProxyEnabled: boolean;

    constructor(args: LicenseClientArgs) {
        this.cacheExpirationInMs =
            args.cacheExpirationInMs || DEFAULT_CACHE_EXPIRATION_MS;
        this.validationProxyEnabled = args.validationProxyEnabled ?? false;
    }

    private async validate(key: string): Promise<License> {
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
}
