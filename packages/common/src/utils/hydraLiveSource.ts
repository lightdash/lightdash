import { z } from 'zod';
import { type HydraApiSource } from '../ee/externalConnections/types';
import { ApiConnectorType } from '../types/querySources';

/**
 * A Hydra source that behaves like a healthy API: it enforces 2 calls at
 * once, 30 a minute and 300 an hour, and Lightdash declares the same.
 */
export const HYDRA_DEFAULT_SETTINGS: HydraApiSource = {
    connector: ApiConnectorType.HYDRA,
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
    onLimit: { status: 429, retryAfter: 'seconds', body: null },
    declaredLimits: 'vendor',
    script: [],
};

const count = z.number().int().min(1);
const errorStatus = z.number().int().min(400).max(599);
const body = z.record(z.string(), z.unknown());

const rateLimitsSchema = z.object({
    concurrentCalls: count.nullable(),
    callsPerSecond: count.nullable(),
    buckets: z.array(
        z.object({
            id: z.string().min(1),
            windowMs: count,
            capacity: count,
        }),
    ),
});

/** What a Hydra source accepts; the API and the setup form both check against it. */
export const HYDRA_SETTINGS_SCHEMA = z.object({
    connector: z.literal(ApiConnectorType.HYDRA),
    rowCount: z.number().int().min(0).max(100_000),
    pageSize: z.number().int().min(0).max(10_000),
    latencyMs: z.number().int().min(0).max(120_000),
    jitterMs: z.number().int().min(0).max(120_000),
    errorRate: z.number().min(0).max(1),
    failAuth: z.boolean(),
    vendorLimits: rateLimitsSchema.nullable(),
    onLimit: z.object({
        status: errorStatus,
        retryAfter: z.enum(['seconds', 'date', 'none']),
        body: body.nullable(),
    }),
    declaredLimits: z.union([z.literal('vendor'), rateLimitsSchema]).nullable(),
    script: z.array(
        z.object({
            calls: z
                .string()
                .regex(/^[1-9]\d*(-([1-9]\d*)?)?$/, 'Use 3, 1-2 or 4-'),
            respond: z.union([
                z.literal('ok'),
                z.object({
                    status: errorStatus,
                    retryAfterSeconds: z.number().int().min(0).optional(),
                    body: body.optional(),
                }),
            ]),
        }),
    ),
});

const describeAllowed = (field: z.ZodType): string | null => {
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
    const parsed = HYDRA_SETTINGS_SCHEMA.safeParse(value);
    if (parsed.success) return null;
    const [issue] = parsed.error.issues;
    const path = issue.path.map(String).join('.');
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

type SettingKey = Exclude<keyof HydraApiSource, 'connector'>;

const SETTING_KEYS = Object.keys(HYDRA_DEFAULT_SETTINGS).filter(
    (key): key is SettingKey => key !== 'connector',
);

const isPairKey = (key: string): key is (typeof PAIR_KEYS)[number] =>
    (PAIR_KEYS as readonly string[]).includes(key);

const isDefault = (settings: HydraApiSource, key: SettingKey) =>
    JSON.stringify(settings[key]) ===
    JSON.stringify(HYDRA_DEFAULT_SETTINGS[key]);

/**
 * Hydra's settings as the setup form shows them: `key=value` pairs when only
 * those keys change, a JSON object of the changed keys otherwise.
 */
export const formatHydraBehaviour = (settings: HydraApiSource): string => {
    const changed = SETTING_KEYS.filter((key) => !isDefault(settings, key));
    if (changed.every(isPairKey)) {
        return changed.map((key) => `${key}=${settings[key]}`).join(' ');
    }
    return JSON.stringify(
        Object.fromEntries(changed.map((key) => [key, settings[key]])),
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
        return typeof value === 'object' && value !== null
            ? (value as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
};

/**
 * Reads `key=value` pairs separated by spaces or commas, or a JSON object;
 * keys left out keep their defaults. Null when a key is unknown or a value
 * doesn't fit it.
 */
export const parseHydraBehaviour = (text: string): HydraApiSource | null => {
    const trimmed = text.trim();
    const values = trimmed.startsWith('{')
        ? readJson(trimmed)
        : readPairs(trimmed);
    if (
        !values ||
        Object.keys(values).some(
            (key) => !(SETTING_KEYS as string[]).includes(key),
        )
    ) {
        return null;
    }
    const settings = { ...HYDRA_DEFAULT_SETTINGS, ...values };
    return getHydraSettingsProblem(settings) === null
        ? (settings as HydraApiSource)
        : null;
};
