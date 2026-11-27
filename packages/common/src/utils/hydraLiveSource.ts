import { z } from 'zod';
import {
    type HydraApiSource,
    type HydraSettings,
} from '../ee/externalConnections/types';
import { ApiConnectorType } from '../types/querySources';

/**
 * A Hydra source that behaves like a healthy API: it enforces 2 calls at
 * once, 30 a minute and 300 an hour, and Lightdash declares the same.
 */
export const HYDRA_DEFAULT_SETTINGS: HydraSettings = {
    rowCount: 1_000,
    pageSize: 0,
    latencyMs: 0,
    jitterMs: 0,
    errorRate: 0,
    failAuth: false,
    vendorLimits: {
        concurrentCalls: 2,
        callsPerSecond: null,
        buckets: [
            { id: 'minute', windowMs: 60_000, capacity: 30 },
            { id: 'hour', windowMs: 3_600_000, capacity: 300 },
        ],
    },
    onLimit: { status: 429, retryAfterFormat: 'seconds' },
    declaredLimits: 'vendor',
    mockResponses: [],
    tokenTtlSeconds: 3_600,
    revokedViewers: [],
    viewerScopes: {},
    denyConsent: false,
};

/** A Hydra source with no settings, so every one takes its default. */
export const HYDRA_DEFAULT_SOURCE: HydraApiSource = {
    connector: ApiConnectorType.HYDRA,
};

const SETTING_KEYS = Object.keys(
    HYDRA_DEFAULT_SETTINGS,
) as (keyof HydraSettings)[];

/** A source's settings with every one it leaves out set to its default. */
export const withHydraDefaults = (source: HydraApiSource): HydraSettings => ({
    ...HYDRA_DEFAULT_SETTINGS,
    ...Object.fromEntries(
        SETTING_KEYS.filter((key) => source[key] !== undefined).map((key) => [
            key,
            source[key],
        ]),
    ),
});

// Caps keep one call's work small: the gate writes a row per bucket per call
const MAX_BUCKETS = 5;
const MAX_BUCKET_ID_LENGTH = 40;
const MAX_MOCK_RESPONSES = 50;
const MAX_VIEWERS = 50;

const viewerSchema = z.string().min(1).max(254);
const scopeSchema = z.enum(['events:read', 'users:read', 'revenue:read']);

const count = z.number().int().min(1);
const errorStatus = z.number().int().min(400).max(599);
const body = z.record(z.string(), z.unknown());

const rateLimitsSchema = z.object({
    concurrentCalls: count.nullable(),
    callsPerSecond: count.nullable(),
    buckets: z
        .array(
            z.object({
                // "second" counts callsPerSecond
                id: z
                    .string()
                    .min(1)
                    .max(MAX_BUCKET_ID_LENGTH)
                    .refine((id) => id !== 'second', 'must not be second'),
                windowMs: count,
                capacity: count,
            }),
        )
        .max(MAX_BUCKETS)
        .refine(
            (buckets) =>
                new Set(buckets.map(({ id }) => id)).size === buckets.length,
            'must have unique ids',
        ),
});

const mockResponseSchema = z
    .object({
        call: count.optional(),
        fromCall: count.optional(),
        toCall: count.optional(),
        status: z.union([z.literal(200), errorStatus]),
        retryAfterSeconds: z.number().int().min(0).max(3_600).optional(),
        body: body.optional(),
    })
    .strict()
    .refine(
        ({ call, fromCall }) =>
            (call === undefined) !== (fromCall === undefined),
        'must set call, or fromCall',
    )
    .refine(
        ({ call, toCall }) => call === undefined || toCall === undefined,
        'must not set toCall with call',
    )
    .refine(
        ({ fromCall, toCall }) =>
            fromCall === undefined ||
            toCall === undefined ||
            toCall >= fromCall,
        'must not set toCall before fromCall',
    )
    .refine(
        ({ status, retryAfterSeconds, body: errorBody }) =>
            status !== 200 ||
            (retryAfterSeconds === undefined && errorBody === undefined),
        'must not set retryAfterSeconds or body with status 200',
    );

const SETTING_SCHEMAS = {
    rowCount: z.number().int().min(0).max(100_000).optional(),
    // At least 10, so the row cap fits in a query's 51 calls
    pageSize: z
        .number()
        .int()
        .refine((size) => size === 0 || (size >= 10 && size <= 10_000), {
            message: 'must be 0, or from 10 to 10000',
        })
        .optional(),
    latencyMs: z.number().int().min(0).max(120_000).optional(),
    jitterMs: z.number().int().min(0).max(120_000).optional(),
    errorRate: z.number().min(0).max(1).optional(),
    failAuth: z.boolean().optional(),
    vendorLimits: rateLimitsSchema.nullable().optional(),
    onLimit: z
        .object({
            status: errorStatus,
            retryAfterFormat: z.enum(['seconds', 'date', 'none']),
            body: body.optional(),
        })
        .strict()
        .optional(),
    declaredLimits: z
        .union([z.literal('vendor'), rateLimitsSchema])
        .nullable()
        .optional(),
    mockResponses: z
        .array(mockResponseSchema)
        .max(MAX_MOCK_RESPONSES)
        .optional(),
    tokenTtlSeconds: z.number().int().min(1).max(86_400).optional(),
    revokedViewers: z.array(viewerSchema).max(MAX_VIEWERS).optional(),
    viewerScopes: z
        .record(viewerSchema, z.array(scopeSchema))
        .refine(
            (scopes) => Object.keys(scopes).length <= MAX_VIEWERS,
            `must have at most ${MAX_VIEWERS} people`,
        )
        .optional(),
    denyConsent: z.boolean().optional(),
};

/** What the API accepts for a Hydra source; anything else is refused. */
const HYDRA_INPUT_SCHEMA = z
    .object({
        connector: z.literal(ApiConnectorType.HYDRA),
        ...SETTING_SCHEMAS,
    })
    .strict();

/**
 * How a stored Hydra source reads. It also holds the engine's own keys
 * (sourceName, fields, lastScan), which are stripped, and a setting saved in
 * an older shape takes its default, so the source still loads.
 */
export const HYDRA_SETTINGS_SCHEMA = z.object({
    connector: z.literal(ApiConnectorType.HYDRA),
    // Each setting is optional, so catching to undefined keeps its type
    ...(Object.fromEntries(
        Object.entries(SETTING_SCHEMAS).map(([key, schema]) => [
            key,
            (schema as z.ZodType).catch(undefined),
        ]),
    ) as unknown as typeof SETTING_SCHEMAS),
});

const unwrap = (field: z.ZodType): z.ZodType =>
    field instanceof z.ZodOptional
        ? unwrap(field.unwrap() as z.ZodType)
        : field;

const describeAllowed = (schema: z.ZodType): string | null => {
    const field = unwrap(schema);
    if (field instanceof z.ZodBoolean) return 'true or false';
    if (!(field instanceof z.ZodNumber)) return null;
    const kind = field.isInt ? 'a whole number' : 'a number';
    const { minValue, maxValue } = field;
    if (maxValue === null || maxValue >= Number.MAX_SAFE_INTEGER) {
        return `${kind} of ${minValue} or more`;
    }
    return `${kind} from ${minValue} to ${maxValue}`;
};

/**
 * What is wrong with a source's settings, naming the field and what it
 * allows, or null when they are valid.
 */
export const getHydraSettingsProblem = (value: unknown): string | null => {
    const parsed = HYDRA_INPUT_SCHEMA.safeParse(value);
    if (parsed.success) return null;
    const [issue] = parsed.error.issues;
    if (issue.code === 'unrecognized_keys') {
        const path = [...issue.path, ...issue.keys].map(String).join('.');
        return `${path} is not a Hydra setting`;
    }
    const path = issue.path.map(String).join('.');
    if (issue.code === 'custom') return `${path} ${issue.message}`;
    if (issue.code === 'too_big' && issue.origin === 'array') {
        return `${path} must have at most ${issue.maximum} entries`;
    }
    const field =
        issue.path.length === 1
            ? (SETTING_SCHEMAS[path as keyof typeof SETTING_SCHEMAS] as
                  | z.ZodType
                  | undefined)
            : undefined;
    const allowed = field ? describeAllowed(field) : null;
    return allowed ? `${path} must be ${allowed}` : `${path}: ${issue.message}`;
};
