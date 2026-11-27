import {
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

/** Airtable sends { error: { type, message } }, or { error: "NOT_FOUND" }. */
const errorSchema = z.object({
    error: z.union([
        z.string(),
        z.object({
            type: z.string().optional(),
            message: z.string().optional(),
        }),
    ]),
});

const readError = (body: unknown) => {
    const parsed = errorSchema.safeParse(body);
    if (!parsed.success) return { type: null, message: null };
    const { error } = parsed.data;
    return typeof error === 'string'
        ? { type: error, message: null }
        : { type: error.type ?? null, message: error.message ?? null };
};

/** Turns a Web API error response into an error that says what to change. */
export const toAirtableError = (
    response: LiveHttpResponse,
    { baseId }: { baseId: string },
): Error => {
    const { type, message } = readError(response.body);
    const detail = message ? `: ${message}` : '';
    if (response.status === 429) {
        return new TooManyRequestsError(
            'Airtable is limiting requests to this base (5 a second); retry in 30 seconds.',
            { retryAfterSeconds: 30 },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `Airtable rejected the personal access token${detail}. Create a new token and update this live data source.`,
        );
    }
    if (response.status === 403 || response.status === 404) {
        return new WarehouseConnectionError(
            `Airtable can't reach base ${baseId} or one of its tables with this token${detail}. Give the token the data.records:read and schema.bases:read scopes and access to the base.`,
        );
    }
    if (response.status === 422) {
        return new WarehouseQueryError(
            `Airtable couldn't read the table${detail || (type ? `: ${type}` : '')}. Check the filters and field names.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `Airtable refused the request (${response.status})${detail}.`,
        );
    }
    return new UnexpectedServerError(
        `Airtable returned ${response.status}${detail}`,
    );
};
