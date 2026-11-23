import { z } from 'zod';
import { type HydraApiSource } from '../ee/externalConnections/types';
import { ApiConnectorType } from '../types/querySources';

type HydraBehaviour = Omit<HydraApiSource, 'connector'>;

/** A Hydra source that behaves like a healthy, unhurried API. */
export const HYDRA_DEFAULT_SETTINGS: HydraApiSource = {
    connector: ApiConnectorType.HYDRA,
    latencyMs: 0,
    errorRate: 0,
    retryAfterEvery: 0,
    retryAfterSeconds: 1,
    failAuth: false,
    rowCount: 1_000,
    callsPerMinute: 30,
    callsPerHour: 300,
};

/** What a Hydra source accepts; the API and the setup form both check against it. */
export const HYDRA_SETTINGS_SCHEMA = z.object({
    connector: z.literal(ApiConnectorType.HYDRA),
    latencyMs: z.number().int().min(0).max(120_000),
    errorRate: z.number().min(0).max(1),
    retryAfterEvery: z.number().int().min(0),
    retryAfterSeconds: z.number().int().min(0).max(3_600),
    failAuth: z.boolean(),
    rowCount: z.number().int().min(0).max(100_000),
    callsPerMinute: z.number().int().min(1),
    callsPerHour: z.number().int().min(1),
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
    const key = String(issue.path[0] ?? '');
    const field = HYDRA_SETTINGS_SCHEMA.shape[
        key as keyof typeof HYDRA_SETTINGS_SCHEMA.shape
    ] as z.ZodType | undefined;
    const allowed = field ? describeAllowed(field) : null;
    return allowed ? `${key} must be ${allowed}` : issue.message;
};

const KEYS = Object.keys(HYDRA_DEFAULT_SETTINGS).filter(
    (key): key is keyof HydraBehaviour => key !== 'connector',
);

const isKey = (key: string): key is keyof HydraBehaviour =>
    (KEYS as string[]).includes(key);

/** Hydra's settings as one line of `key=value` pairs, as the setup form shows them. */
export const formatHydraBehaviour = (settings: HydraApiSource): string =>
    KEYS.filter((key) => settings[key] !== HYDRA_DEFAULT_SETTINGS[key])
        .map((key) => `${key}=${settings[key]}`)
        .join(' ');

/**
 * Reads `key=value` pairs separated by spaces or commas; keys left out keep
 * their defaults. Null when a key is unknown or a value doesn't fit it.
 */
export const parseHydraBehaviour = (text: string): HydraApiSource | null => {
    const settings: HydraApiSource = { ...HYDRA_DEFAULT_SETTINGS };
    const pairs = text.split(/[\s,]+/).filter(Boolean);
    for (const pair of pairs) {
        const [key, value, ...rest] = pair.split('=');
        if (!key || value === undefined || rest.length > 0 || !isKey(key)) {
            return null;
        }
        if (key === 'failAuth') {
            if (value !== 'true' && value !== 'false') return null;
            settings.failAuth = value === 'true';
        } else {
            const number = Number(value);
            if (value === '' || !Number.isFinite(number) || number < 0) {
                return null;
            }
            if (key === 'errorRate') {
                if (number > 1) return null;
            } else if (!Number.isInteger(number)) {
                return null;
            }
            settings[key] = number;
        }
    }
    return getHydraSettingsProblem(settings) === null ? settings : null;
};
