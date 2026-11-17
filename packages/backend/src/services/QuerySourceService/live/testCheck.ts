import {
    TooManyRequestsError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type ExternalConnectionApiSource,
    type ExternalFetchResponse,
    type LiveSourceTestCheck,
} from '@lightdash/common';
import { getLiveIntegration } from './registry';

const toFailureSummary = (label: string, status: number, error: Error) => {
    if (status === 401) return `${label} didn't accept the credentials`;
    if (error instanceof TooManyRequestsError) {
        return `${label} is limiting requests right now`;
    }
    if (status === 403) {
        return `Signed in, but this account can't read from ${label}`;
    }
    if (error instanceof WarehouseConnectionError) {
        return `${label} refused access`;
    }
    if (error instanceof WarehouseQueryError) {
        return `${label} couldn't run the test`;
    }
    return `${label} had a problem answering`;
};

/**
 * Reads a live data source test response the way an admin needs it: a 2xx
 * through the integration's `summarizeTest`, anything else through its
 * `toError`, which already says what to change.
 */
export const getLiveSourceTestCheck = (
    apiSource: ExternalConnectionApiSource,
    response: ExternalFetchResponse,
): LiveSourceTestCheck => {
    const integration = getLiveIntegration(apiSource.connector);
    const { label } = integration;
    if (response.status >= 200 && response.status < 300) {
        const summary = integration.summarizeTest?.(response.body, apiSource);
        return {
            ok: true,
            summary: summary?.summary ?? `Connected to ${label}`,
            detail: null,
            facts: summary?.facts ?? [],
        };
    }
    const error = integration.toError(response, apiSource);
    return {
        ok: false,
        summary: toFailureSummary(label, response.status, error),
        detail: error.message,
        facts: [],
    };
};
