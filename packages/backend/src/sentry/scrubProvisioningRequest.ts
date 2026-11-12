import type { ErrorEvent } from '@sentry/node';

const PROVISIONING_PATH = '/api/v1/provisioning/';

/** Keeps the caller's identity token and the owner password out of error reports. */
export const scrubProvisioningRequest = (event: ErrorEvent): ErrorEvent => {
    const { request } = event;
    if (!request?.url?.includes(PROVISIONING_PATH)) return event;
    const headers = Object.fromEntries(
        Object.entries(request.headers ?? {}).filter(
            ([name]) => name.toLowerCase() !== 'authorization',
        ),
    );
    return { ...event, request: { ...request, headers, data: undefined } };
};
