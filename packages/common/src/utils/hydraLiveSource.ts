import { z } from 'zod';
import {
    type HydraApiSource,
    type HydraSettings,
} from '../ee/externalConnections/types';
import { ApiConnectorType } from '../types/querySources';

/** What a Hydra source seeds when it sets nothing. */
export const HYDRA_DEFAULT_SETTINGS: HydraSettings = {
    rowCount: 1_000,
    objects: [],
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

const MAX_OBJECTS = 10;
const MAX_OBJECT_FIELDS = 20;
const MAX_OBJECT_RECORDS = 10_000;

const vendorId = z
    .string()
    .regex(
        /^[A-Za-z][A-Za-z0-9_]{0,59}$/,
        'must be a letter then up to 59 letters, digits or underscores',
    );
const label = z.string().trim().min(1).max(100);

const objectSchema = z
    .object({
        id: vendorId,
        label,
        recordCount: z.number().int().min(0).max(MAX_OBJECT_RECORDS).optional(),
        fields: z
            .array(
                z
                    .object({
                        id: vendorId,
                        label,
                        type: z.enum(['string', 'number', 'date', 'boolean']),
                        system: z.boolean().optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(MAX_OBJECT_FIELDS)
            .refine(
                (fields) =>
                    new Set(fields.map(({ id }) => id)).size === fields.length,
                'must have unique ids',
            ),
    })
    .strict();

const SETTING_SCHEMAS = {
    rowCount: z.number().int().min(0).max(100_000).optional(),
    objects: z
        .array(objectSchema)
        .max(MAX_OBJECTS)
        .refine(
            (objects) =>
                new Set(objects.map(({ id }) => id)).size === objects.length,
            'must have unique ids',
        )
        .optional(),
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
