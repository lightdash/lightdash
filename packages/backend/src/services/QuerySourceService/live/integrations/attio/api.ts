import { WarehouseConnectionError } from '@lightdash/common';
import { z } from 'zod';
import { toLiveHttpError, type LiveHttpResponse } from '../../sdk';

/** Records one query reads; one fewer than 20 pages of 500, to detect more. */
export const ATTIO_PAGE_SIZE = 500;

export const ATTIO_MAX_PAGES = 20;

export const ATTIO_MAX_RECORDS = ATTIO_PAGE_SIZE * ATTIO_MAX_PAGES - 1;

const errorSchema = z.object({
    message: z.string().optional(),
    code: z.string().optional(),
});

/** The access token can't read an object, or the workspace lacks it; a scan skips it. */
export class AttioObjectAccessError extends WarehouseConnectionError {}

/** Turns an Attio error response into an error that says what to change. */
export const toAttioError = (
    response: LiveHttpResponse,
    now = new Date(),
): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const message = parsed.success ? (parsed.data.message ?? '') : '';
    const code = parsed.success ? (parsed.data.code ?? '') : '';
    // Attio's messages end in a full stop; ours add the next sentence
    const detail = message ? `: ${message.replace(/\.+$/, '')}` : '';
    if (response.status === 403) {
        return new AttioObjectAccessError(
            `The Attio access token can't read this object${detail}. Give it the record_permission:read and object_configuration:read scopes.`,
        );
    }
    // A rate limit or a rejected token wins over the disabled-object code
    const disabled =
        response.status === 404 || code === 'standard_object_disabled';
    if (disabled && response.status !== 429 && response.status !== 401) {
        return new AttioObjectAccessError(
            `This Attio workspace doesn't have this object turned on${detail}. A workspace admin turns it on in Attio's workspace settings, under Objects.`,
        );
    }
    return toLiveHttpError(
        response,
        {
            rateLimited: (retryAfterSeconds) =>
                `Attio rate limit reached${detail}. Queries with many filters or sorts use up the limit faster; retry ${
                    retryAfterSeconds
                        ? `in ${retryAfterSeconds} seconds`
                        : 'shortly'
                }.`,
            connection: {
                401: `Attio rejected the access token${detail}. Create a new token in Attio's workspace settings and update this live data source.`,
            },
            rejected: `Attio couldn't run this query${detail}. Check the filter values, or use fewer filters and sorts.`,
            failed: `Attio returned ${response.status}${detail}`,
        },
        now,
    );
};
