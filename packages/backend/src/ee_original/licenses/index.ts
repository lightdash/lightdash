import { AuthorizationError, UnexpectedServerError } from '@lightdash/common';

type LicenseResponse = {
    meta?: {
        ts: string;
        valid: boolean;
        detail: string;
        code: string; // 'VALID' | 'NOT_FOUND' | 'SUSPENDED' | 'EXPIRED'
    };
    data?: {
        id: string;
    };
    errors?: Array<{
        title: string;
        detail: string;
        code?: string;
    }>;
};

type License = Required<Pick<LicenseResponse, 'meta' | 'data'>>;

type ValidateLicenseKeyArgs = {
    endpoint: string;
    key: string;
};

async function validateLicenseKey({
    endpoint,
    key,
}: ValidateLicenseKeyArgs): Promise<License> {
    if (!key) {
        throw new AuthorizationError(
            'License key is required for license validation',
        );
    }

    const validation = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/vnd.api+json',
            Accept: 'application/vnd.api+json',
        },
        body: JSON.stringify({
            meta: {
                key,
            },
        }),
    });

    const { meta, errors, data } = (await validation.json()) as LicenseResponse;

    if (errors) {
        throw new UnexpectedServerError(
            `License key validation failed: ${errors[0].detail}`,
        );
    }

    if (!meta || !data) {
        throw new UnexpectedServerError(
            `License key validation failed: response metadata not found`,
        );
    }

    if (!meta.valid) {
        throw new AuthorizationError(`Invalid license key: ${meta?.detail}`);
    }

    return {
        meta,
        data,
    };
}
