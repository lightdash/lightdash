import {
    getHubspotReadScopes,
    HUBSPOT_OBJECTS,
    TooManyRequestsError,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
    type HubspotObject,
} from '@lightdash/common';
import { z } from 'zod';
import { type LiveHttpResponse } from '../../sdk';

/** One search takes at most this many filters in a group. */
export const HUBSPOT_MAX_FILTERS = 6;

/** HubSpot's search returns at most 200 records a call. */
export const HUBSPOT_PAGE_SIZE = 200;

export const HUBSPOT_MAX_PAGES = 5;

export const HUBSPOT_MAX_ROWS = HUBSPOT_PAGE_SIZE * HUBSPOT_MAX_PAGES;

/**
 * API names of the declared fields: the keys every search result has. They
 * are camelCase, so no property name (lowercase) can take them.
 */
export const HUBSPOT_RECORD_COLUMNS = ['id', 'createdAt', 'updatedAt'] as const;

export type HubspotRecordColumn = (typeof HUBSPOT_RECORD_COLUMNS)[number];

export const HUBSPOT_COUNT_REASON =
    "HubSpot search returns one total, so Count can't be split by a field. Filter by the field instead, or list records without Count.";

/** Objects as HubSpot names them. */
export const HUBSPOT_OBJECT_LABELS: Record<HubspotObject, string> = {
    deals: 'Deals',
    contacts: 'Contacts',
    companies: 'Companies',
    tickets: 'Tickets',
    leads: 'Leads',
};

/** The explore listing deal and ticket pipelines with their stages. */
export const HUBSPOT_PIPELINE_STAGES = 'pipeline_stages';

/** Columns of a pipeline stages request, one per field. */
export const HUBSPOT_PIPELINE_COLUMNS = [
    'objectType',
    'pipelineId',
    'pipelineLabel',
    'pipelineDisplayOrder',
    'stageId',
    'stageLabel',
    'stageDisplayOrder',
    'probability',
    'isClosed',
] as const;

export type HubspotPipelineColumn = (typeof HUBSPOT_PIPELINE_COLUMNS)[number];

/** The CRM object an explore definition reads. */
export const toHubspotObject = (definitionName: string): HubspotObject => {
    const object = HUBSPOT_OBJECTS.find((name) => name === definitionName);
    if (!object) {
        throw new Error(`"${definitionName}" isn't a HubSpot object`);
    }
    return object;
};

/**
 * A custom object's id: HubSpot's `objectTypeId`, such as `2-123456`. It is
 * searched like the standard objects.
 */
export const HUBSPOT_CUSTOM_OBJECT_ID = /^2-\d+$/;

/** A standard object's name, or a custom object's id. */
export type HubspotSearchObject = HubspotObject | `2-${string}`;

/**
 * The object an explore reads: a custom object's id when the explore was
 * was built from a scanned custom object, else the standard object its definition names.
 */
export const toHubspotSearchObject = (
    objectId: string | null,
    definitionName: string,
): HubspotSearchObject => {
    if (objectId === null) {
        return toHubspotObject(definitionName);
    }
    if (!HUBSPOT_CUSTOM_OBJECT_ID.test(objectId)) {
        throw new Error(`"${objectId}" isn't a HubSpot custom object id`);
    }
    return objectId as HubspotSearchObject;
};

/** A label field's API name: the property it reads, then `:label`. */
export const HUBSPOT_LABEL_SUFFIX = ':label';

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
