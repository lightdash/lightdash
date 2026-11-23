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

/**
 * What a Hydra source accepts. Stored sources carry the engine's own keys too
 * (sourceName, fields, lastScan), so reading one strips unknown keys; the API
 * and the setup form check input with HYDRA_INPUT_SCHEMA, which refuses them.
 */
export const HYDRA_SETTINGS_SCHEMA = z.object({
    connector: z.literal(ApiConnectorType.HYDRA),
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
});

const HYDRA_INPUT_SCHEMA = HYDRA_SETTINGS_SCHEMA.strict();

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
            ? (HYDRA_SETTINGS_SCHEMA.shape[
                  path as keyof typeof HYDRA_SETTINGS_SCHEMA.shape
              ] as z.ZodType | undefined)
            : undefined;
    const allowed = field ? describeAllowed(field) : null;
    return allowed ? `${path} must be ${allowed}` : `${path}: ${issue.message}`;
};

/** The settings the Behaviour field reads as `key=value` pairs; the rest take JSON. */
const PAIR_KEYS = [
    'rowCount',
    'pageSize',
    'latencyMs',
    'jitterMs',
    'errorRate',
    'failAuth',
] as const;

const isPairKey = (key: string): key is (typeof PAIR_KEYS)[number] =>
    (PAIR_KEYS as readonly string[]).includes(key);

/**
 * Hydra's settings as the setup form shows them: `key=value` pairs when only
 * those keys are set, a JSON object of the set keys otherwise.
 */
export const formatHydraBehaviour = (source: HydraApiSource): string => {
    const set = SETTING_KEYS.filter((key) => source[key] !== undefined);
    if (set.every(isPairKey)) {
        return set.map((key) => `${key}=${source[key]}`).join(' ');
    }
    return JSON.stringify(
        Object.fromEntries(set.map((key) => [key, source[key]])),
    );
};

const readPairs = (text: string): Record<string, unknown> | null => {
    const values: Record<string, unknown> = {};
    const pairs = text.split(/[\s,]+/).filter(Boolean);
    for (const pair of pairs) {
        const [key, value, ...rest] = pair.split('=');
        if (!key || !value || rest.length > 0 || !isPairKey(key)) return null;
        if (key === 'failAuth') {
            if (value !== 'true' && value !== 'false') return null;
            values[key] = value === 'true';
        } else {
            values[key] = Number(value);
        }
    }
    return values;
};

const readJson = (text: string): Record<string, unknown> | null => {
    try {
        const value: unknown = JSON.parse(text);
        return typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
};

/**
 * Reads `key=value` pairs separated by spaces or commas, or a JSON object,
 * into a source that sets only those keys. Null when a key is unknown or a
 * value doesn't fit it.
 */
export const parseHydraBehaviour = (text: string): HydraApiSource | null => {
    const trimmed = text.trim();
    const values = trimmed.startsWith('{')
        ? readJson(trimmed)
        : readPairs(trimmed);
    if (!values) return null;
    const source = { ...values, connector: ApiConnectorType.HYDRA };
    return getHydraSettingsProblem(source) === null
        ? (source as HydraApiSource)
        : null;
};
