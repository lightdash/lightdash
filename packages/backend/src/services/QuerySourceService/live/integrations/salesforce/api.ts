import {
    SALESFORCE_OBJECTS,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type SalesforceObject,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

/** Salesforce returns query results in batches of up to 2,000 records. */
export const SALESFORCE_BATCH_SIZE = 2_000;

/** Record lists read at most this many rows: 5 batches with the extra row. */
export const SALESFORCE_MAX_RECORD_ROWS = 9_999;

export const SALESFORCE_MAX_CALLS = Math.ceil(
    (SALESFORCE_MAX_RECORD_ROWS + 1) / SALESFORCE_BATCH_SIZE,
);

/**
 * A query with aggregate functions comes back in one batch: Salesforce
 * refuses it past 2,000 rows (no queryMore), so its LIMIT never goes higher.
 */
export const SALESFORCE_MAX_AGGREGATE_ROWS = 2_000;

/** Each object's explore name, as people say it. */
const EXPLORE_NAMES: Record<SalesforceObject, string> = {
    Opportunity: 'opportunities',
    Account: 'accounts',
    Lead: 'leads',
    Contact: 'contacts',
};

/** The object an explore definition reads. */
export const toSalesforceObject = (
    definitionName: string,
): SalesforceObject => {
    const object = SALESFORCE_OBJECTS.find(
        (candidate) => EXPLORE_NAMES[candidate] === definitionName,
    );
    if (!object) {
        throw new Error(`"${definitionName}" isn't a Salesforce object`);
    }
    return object;
};

// Salesforce sends a list of { message, errorCode }
const errorsSchema = z.array(
    z.object({
        message: z.string().optional(),
        errorCode: z.string().optional(),
    }),
);

const readError = (body: unknown) => {
    const parsed = errorsSchema.safeParse(body);
    const [first] = parsed.success ? parsed.data : [];
    return {
        code: first?.errorCode ?? '',
        message: first?.message?.trim() ?? '',
    };
};

/** The signed-in user can't read an object, which a scan skips. */
export class SalesforceObjectAccessError extends WarehouseConnectionError {}

/** Turns a Salesforce error response into an error that says what to change. */
export const toSalesforceError = (response: LiveHttpResponse): Error => {
    const { code, message } = readError(response.body);
    const detail = message ? `: ${message}` : '';
    if (code === 'REQUEST_LIMIT_EXCEEDED') {
        return new TooManyRequestsError(
            `The Salesforce org has used its API calls for the last 24 hours${detail}. Calls free up over the day; cached results still answer meanwhile.`,
            { retryAfterSeconds: null },
        );
    }
    if (response.status === 429) {
        return new TooManyRequestsError(
            `Salesforce is limiting requests${detail}. Retry shortly.`,
            { retryAfterSeconds: null },
        );
    }
    if (response.status === 401 || code === 'INVALID_SESSION_ID') {
        return new WarehouseConnectionError(
            `Salesforce rejected the sign-in${detail}. Reconnect this live data source in Live data sources.`,
        );
    }
    if (code === 'API_DISABLED_FOR_ORG' || code === 'API_CURRENTLY_DISABLED') {
        return new WarehouseConnectionError(
            `This Salesforce org or user can't use the API${detail}. The org needs an edition with API access and the user the "API Enabled" permission.`,
        );
    }
    if (response.status === 403 || code === 'INSUFFICIENT_ACCESS') {
        return new SalesforceObjectAccessError(
            `The signed-in Salesforce user can't read this object or one of its fields${detail}. Give the user read access to it, or reconnect with another user.`,
        );
    }
    if (code === 'QUERY_TIMEOUT') {
        return new WarehouseQueryError(
            `Salesforce took too long to run this query${detail}. Add a filter, especially on a date, or remove a dimension.`,
        );
    }
    if (code === 'INVALID_FIELD' || code === 'INVALID_TYPE') {
        return new WarehouseQueryError(
            `Salesforce doesn't know a field this query reads${detail}. The field may be gone or hidden from this user; rescan the source's fields.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Salesforce couldn't run this query${detail}. Check the filter values, or remove a dimension.`,
        );
    }
    return new UnexpectedServerError(
        `Salesforce returned ${response.status}${detail}`,
    );
};
