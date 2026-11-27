import {
    getHubspotReadScopes,
    HUBSPOT_OBJECTS,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

const errorSchema = z.object({
    message: z.string().optional(),
    category: z.string().optional(),
    errors: z
        .array(
            z.object({
                context: z
                    .object({
                        requiredGranularScopes: z.array(z.string()).optional(),
                    })
                    .optional(),
            }),
        )
        .optional(),
});

/** Every object's read scopes, one object to a clause. */
const READ_SCOPES = HUBSPOT_OBJECTS.map(
    (object) => `${object}: ${getHubspotReadScopes(object).join(' and ')}`,
).join('; ');

/** The scopes HubSpot says the call needed, when it says. */
const getRequiredScopes = (body: z.infer<typeof errorSchema>) => [
    ...new Set(
        (body.errors ?? []).flatMap(
            ({ context }) => context?.requiredGranularScopes ?? [],
        ),
    ),
];

/** Seconds until HubSpot accepts calls again, when it says. */
const getRetryAfterSeconds = (headers: Record<string, string>) => {
    const seconds = Number(headers['retry-after']);
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
};

/**
 * Errors that say this token or portal can't read an object: a missing scope,
 * or leads without Sales Hub Professional or Enterprise.
 */
const UNREADABLE_STATUSES = new Set([400, 403, 404]);
const unreadableErrors = new WeakSet<Error>();

export const isUnreadableObjectError = (error: unknown) =>
    error instanceof Error && unreadableErrors.has(error);

const toError = (response: LiveHttpResponse): Error => {
    const parsed = errorSchema.safeParse(response.body);
    const message = parsed.success ? (parsed.data.message ?? '') : '';
    const requiredScopes = parsed.success ? getRequiredScopes(parsed.data) : [];
    // HubSpot's messages often end with a full stop; ours add their own
    const trimmed = message.trim().replace(/[.!]+$/, '');
    const detail = trimmed ? `: ${trimmed}` : '';
    if (response.status === 429) {
        const retryAfterSeconds = getRetryAfterSeconds(response.headers);
        return new TooManyRequestsError(
            `HubSpot rate limit reached${detail}. HubSpot allows a few searches a second per account; retry ${
                retryAfterSeconds
                    ? `in ${retryAfterSeconds} seconds`
                    : 'shortly'
            }.`,
            { retryAfterSeconds },
        );
    }
    if (response.status === 401) {
        return new WarehouseConnectionError(
            `HubSpot rejected the access token${detail}. Copy the private app's access token again, or rotate it, and update this live data source.`,
        );
    }
    if (response.status === 403) {
        const needed =
            requiredScopes.length > 0
                ? ` This call needs ${requiredScopes.join(' or ')}.`
                : '';
        return new WarehouseConnectionError(
            `The HubSpot private app is missing a scope${detail}.${needed} Each explore needs its object's read scopes (${READ_SCOPES}); leads also need Sales Hub Professional or Enterprise. Explores whose scopes are granted keep working.`,
        );
    }
    if (response.status >= 400 && response.status < 500) {
        return new WarehouseQueryError(
            `HubSpot couldn't run this search${detail}. Check the filter values, or use fewer filters.`,
        );
    }
    return new UnexpectedServerError(
        `HubSpot returned ${response.status}${detail}`,
    );
};

/** Turns a HubSpot error response into an error that says what to change. */
export const toHubspotError = (response: LiveHttpResponse): Error => {
    const error = toError(response);
    if (UNREADABLE_STATUSES.has(response.status)) {
        unreadableErrors.add(error);
    }
    return error;
};
