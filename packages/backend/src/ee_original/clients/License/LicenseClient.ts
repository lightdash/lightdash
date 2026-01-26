import { UnexpectedServerError } from '@lightdash/common';

type LicenceResponse = {
    meta: {
        ts: string; // "2021-03-15T19:27:50.440Z",
        valid: boolean;
        detail: string;
        code: string;
        scope?: unknown;
    };
    data?: unknown;
    errors?: Array<{
        title: string;
        detail: string;
        code?: string;
        source?: unknown;
    }>;
};

type License = {
    isValid: boolean;
    detail: string;
    code: string;
    cachedTimestamp?: number;
};

const DEFAULT_CACHE_EXPIRATION_MS = 1000 * 60 * 60 * 24; // 24 hours

type LicenseClientArgs = {
    cacheExpirationInMs?: number;
};

export default class LicenseClient {
    private cachedLicenses: Map<string, Required<License>> = new Map();

    private readonly cacheExpirationInMs: number = DEFAULT_CACHE_EXPIRATION_MS;

    constructor(args: LicenseClientArgs) {
        this.cacheExpirationInMs =
            args.cacheExpirationInMs || DEFAULT_CACHE_EXPIRATION_MS;
    }

    static async validate(key: string): Promise<License> {
        const validation = await fetch(
            `https://api.keygen.sh/v1/accounts/1ae7d3a8-4665-44e4-989d-9de54c84761a/licenses/actions/validate-key`,
            {
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
            },
        );

        const { meta, errors } = (await validation.json()) as LicenceResponse;

        // Check if we received an error during validation.
        if (errors) {
            throw new UnexpectedServerError(
                errors.map((e) => e.detail).join(', '),
            );
        }

        return {
            isValid: meta.valid,
            detail: meta.detail,
            code: meta.code,
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

        const license = await LicenseClient.validate(key);
        this.cachedLicenses.set(key, {
            ...license,
            cachedTimestamp: now,
        });

        return license;
    }
}
