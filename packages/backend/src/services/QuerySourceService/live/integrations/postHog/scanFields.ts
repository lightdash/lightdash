import { DimensionType } from '@lightdash/common';
import { z } from 'zod';
import {
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
} from '../../sdk';
import { POSTHOG_FILTERS_BY_TYPE } from './filters';

/** Properties a scan keeps per kind; PostHog projects can define thousands. */
export const POSTHOG_MAX_SCANNED_PROPERTIES = 2000;

// Ad click ids PostHog captures from landing URLs: one value per click, never a useful dimension.
const AD_CLICK_ID_PROPERTIES = new Set([
    'gclid',
    'gad_source',
    'gbraid',
    'wbraid',
    'dclid',
    'fbclid',
    'msclkid',
    'twclid',
    'ttclid',
    'li_fat_id',
    'mc_cid',
    'igshid',
    'rdt_cid',
    'irclid',
    '_kx',
]);

/** PostHog's own bookkeeping properties (`$lib_version`) and ad click ids. */
export const isInternalPostHogProperty = (apiName: string) => {
    const property = apiName.split('.').at(-1) ?? apiName;
    return property.startsWith('$') || AD_CLICK_ID_PROPERTIES.has(property);
};

const dimension = ({
    name,
    apiName,
    label,
    type = DimensionType.STRING,
    sql = `\${TABLE}.${apiName}`,
    description,
    aiHint,
}: {
    name: string;
    apiName: string;
    label: string;
    type?: DimensionType;
    sql?: string;
    description?: string;
    aiHint?: string;
}): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    sql,
    filterOperators: POSTHOG_FILTERS_BY_TYPE[type],
});

const propertyDefinitionsSchema = z.object({
    results: z.array(
        z.object({
            name: z.string(),
            property_type: z.string().nullish(),
            description: z.string().nullish(),
        }),
    ),
});

// Only names that need no quoting, so a property name can never change the query.
const PROPERTY_NAME = /^[$A-Za-z_][$A-Za-z0-9_]{0,99}$/;

const TYPES_BY_PROPERTY_TYPE: Record<string, DimensionType> = {
    Numeric: DimensionType.NUMBER,
    Boolean: DimensionType.BOOLEAN,
    DateTime: DimensionType.TIMESTAMP,
};

const toScannedFieldName = (prefix: string, property: string) =>
    `${prefix}_${property
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase()}`;

export type PostHogPropertyKind = 'event' | 'person';

/**
 * Adds a dimension per event and person property PostHog knows, read from
 * its property definitions. Properties the hand-written fields already cover
 * are skipped; unreadable definitions add nothing.
 */
export const withPostHogPropertyFields = (
    definition: LiveExploreDefinition,
    propertyDefinitions: Record<PostHogPropertyKind, unknown>,
): LiveExploreDefinition => {
    const taken = new Set([
        ...definition.dimensions.map(({ name }) => name),
        ...definition.metrics.map(({ name }) => name),
    ]);
    const coveredApiNames = new Set(
        definition.dimensions.map(({ apiName }) => apiName),
    );
    const toDimensions = (kind: PostHogPropertyKind) => {
        const parsed = propertyDefinitionsSchema.safeParse(
            propertyDefinitions[kind],
        );
        if (!parsed.success) {
            return [];
        }
        const path = kind === 'event' ? 'properties' : 'person.properties';
        const prefix = kind === 'event' ? 'property' : 'person';
        const labelPrefix = kind === 'event' ? '' : 'Person ';
        return parsed.data.results
            .filter(({ name }) => PROPERTY_NAME.test(name))
            .slice(0, POSTHOG_MAX_SCANNED_PROPERTIES)
            .map(({ name, property_type: propertyType, description }) => {
                const type =
                    TYPES_BY_PROPERTY_TYPE[propertyType ?? ''] ??
                    DimensionType.STRING;
                const apiName = `${path}.${name}`;
                return dimension({
                    name: toScannedFieldName(prefix, name),
                    apiName,
                    label: `${labelPrefix}${name}`,
                    description:
                        description?.trim() ||
                        `The ${name} ${kind} property, as sent to PostHog.`,
                    ...(kind === 'person'
                        ? {
                              aiHint: "Person properties reflect the person's current values, not their values at the time of the event (depends on the project's person-on-events mode).",
                          }
                        : {}),
                    type,
                    sql:
                        type === DimensionType.NUMBER
                            ? `toFloat(\${TABLE}.${apiName})`
                            : `\${TABLE}.${apiName}`,
                });
            });
    };
    const scanned = [
        ...toDimensions('event'),
        ...toDimensions('person'),
    ].filter(({ name, apiName }) => {
        if (taken.has(name) || coveredApiNames.has(apiName)) {
            return false;
        }
        taken.add(name);
        return true;
    });
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...scanned],
    };
};
