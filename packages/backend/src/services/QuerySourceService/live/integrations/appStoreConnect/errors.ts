import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../types';

const errorSchema = z.object({
    errors: z
        .array(
            z.object({
                code: z.string().optional(),
                detail: z.string().optional(),
            }),
        )
        .min(1),
});

const readDetail = (body: unknown) => {
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) {
        return '';
    }
    const [{ code, detail }] = parsed.data.errors;
    // Our sentence goes on after it
    return (detail || code || '').replace(/[.!\s]+$/, '');
};

/** Turns an App Store Connect error response into an error that says what to change. */
export const toAppStoreConnectError = (
    response: LiveHttpResponse,
    { appId }: { appId: string },
): Error => {
    const detail = readDetail(response.body);
    switch (response.status) {
        case 401:
            return new WarehouseConnectionError(
                "App Store Connect didn't accept the API key. Check the key ID, the issuer ID and the private key, and that the key is still active.",
            );
        case 403:
            return new WarehouseConnectionError(
                `This App Store Connect API key's role can't read this data: ${detail || 'forbidden'}. Use a key whose role can, then add the source again.`,
            );
        case 404:
            return new WarehouseConnectionError(
                `App Store Connect could not find app ${appId}. Check the app ID and that the key can see the app.`,
            );
        case 429: {
            const retryAfter = Number(response.headers['retry-after']);
            return new TooManyRequestsError(
                "App Store Connect's hourly request limit for this API key is used up. Retry later.",
                {
                    retryAfterSeconds:
                        Number.isFinite(retryAfter) && retryAfter > 0
                            ? retryAfter
                            : null,
                },
            );
        }
        case 400:
            return new WarehouseQueryError(
                `App Store Connect rejected the request: ${detail || 'invalid request'}`,
            );
        default:
            return new UnexpectedServerError(
                `App Store Connect returned ${response.status}${
                    detail ? `: ${detail}` : ''
                }`,
            );
    }
};
