import { DimensionType, FilterOperator } from '@lightdash/common';
import { z } from 'zod';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
} from '../../explores/definition';
import { HUBSPOT_LABEL_SUFFIX } from './api';
import { HUBSPOT_DEALS_EXPLORE } from './explores';
import {
    HUBSPOT_BOOLEAN_FILTERS,
    HUBSPOT_CHOICE_FILTERS,
    HUBSPOT_DATE_FILTERS,
    HUBSPOT_NUMBER_FILTERS,
    HUBSPOT_TEXT_FILTERS,
} from './filters';

/** Properties the built-in fields already read. */
const BUILT_IN_PROPERTIES = new Set([
    'hs_object_id',
    'createdate',
    'hs_createdate',
    'hs_lastmodifieddate',
    'lastmodifieddate',
]);

/** One object's property list from a scan; anything else reads as none. */
export const readHubspotProperties = (
    scanned: unknown,
    object: string,
): unknown =>
    scanned !== null &&
    typeof scanned === 'object' &&
    Object.hasOwn(scanned, object)
        ? (scanned as Record<string, unknown>)[object]
        : undefined;

/** HubSpot property types Lightdash reads, with how it filters them. */
const PROPERTY_RULES: Record<
    string,
    { type: DimensionType; filterOperators: FilterOperator[] }
> = {
    string: {
        type: DimensionType.STRING,
        filterOperators: HUBSPOT_TEXT_FILTERS,
    },
    phone_number: {
        type: DimensionType.STRING,
        filterOperators: HUBSPOT_TEXT_FILTERS,
    },
    enumeration: {
        type: DimensionType.STRING,
        filterOperators: HUBSPOT_CHOICE_FILTERS,
    },
    number: {
        type: DimensionType.NUMBER,
        filterOperators: HUBSPOT_NUMBER_FILTERS,
    },
    bool: {
        type: DimensionType.BOOLEAN,
        filterOperators: HUBSPOT_BOOLEAN_FILTERS,
    },
    date: { type: DimensionType.DATE, filterOperators: HUBSPOT_DATE_FILTERS },
    datetime: {
        type: DimensionType.TIMESTAMP,
        filterOperators: HUBSPOT_DATE_FILTERS,
    },
};

const MAX_SCANNED_PROPERTIES = 400;

const MAX_LISTED_OPTIONS = 15;

/**
 * Pipelines and stages whose values are ids (tickets' stages are 1, 2, ...),
 * so their descriptions list every value with its label.
 */
const PIPELINE_PROPERTIES = new Set([
    'pipeline',
    'dealstage',
    'hs_pipeline',
    'hs_pipeline_stage',
]);

// Internal names are lowercase letters, digits and underscores
const PROPERTY_NAME = /^[a-z][a-z0-9_]*$/;

/** HubSpot's own hs_ properties people read often; other hs_ ones start hidden. */
const USEFUL_HS_PROPERTIES = new Set([
    'hs_is_closed',
    'hs_is_closed_won',
    'hs_deal_stage_probability',
    'hs_forecast_amount',
    'hs_lead_status',
    'hs_analytics_source',
    'hs_pipeline',
    'hs_pipeline_stage',
    'hs_ticket_priority',
    'hs_ticket_category',
    'hs_lead_name',
    'hs_lead_type',
    'hs_lead_label',
]);

/** The property a field reads: itself, or the one a label field shows. */
export const toHubspotPropertyName = (apiName: string) =>
    apiName.endsWith(HUBSPOT_LABEL_SUFFIX)
        ? apiName.slice(0, -HUBSPOT_LABEL_SUFFIX.length)
        : apiName;

export const isInternalHubspotField = (apiName: string) => {
    const property = toHubspotPropertyName(apiName);
    return property.startsWith('hs_') && !USEFUL_HS_PROPERTIES.has(property);
};

/**
 * Names properties can't take: the built-in fields and Count. A property
 * named like one gets a prefix, from its name alone, so it never changes.
 */
const RESERVED_NAMES = new Set([
    // Every object's explore has the same built-in fields
    ...HUBSPOT_DEALS_EXPLORE.dimensions.map(({ name }) => name),
    ...HUBSPOT_DEALS_EXPLORE.metrics.map(({ name }) => name),
]);

const toDimensionName = (property: string) =>
    RESERVED_NAMES.has(property) ? `property_${property}` : property;

const propertiesSchema = z.object({
    results: z.array(
        z.object({
            name: z.string(),
            label: z.string(),
            type: z.string(),
            fieldType: z.string().optional(),
            description: z.string().nullable().optional(),
            hidden: z.boolean().optional(),
            options: z
                .array(z.object({ label: z.string(), value: z.string() }))
                .optional(),
        }),
    ),
});

type HubspotProperty = z.infer<typeof propertiesSchema>['results'][number];

const describeProperty = ({ label, description }: HubspotProperty) => {
    // HubSpot's own descriptions often end without a full stop
    const own = description?.trim().replace(/([^.!?])$/, '$1.');
    return own || `The ${label} property in HubSpot.`;
};

/** How to filter a property: its option names, checkbox and text rules. */
const hintProperty = ({ name, type, fieldType, options }: HubspotProperty) => {
    const listed = PIPELINE_PROPERTIES.has(name)
        ? (options ?? [])
        : (options ?? []).slice(0, MAX_LISTED_OPTIONS);
    const more = (options ?? []).length - listed.length;
    return [
        type === 'enumeration' && listed.length > 0
            ? `Values are HubSpot's internal option names: ${listed
                  .map(({ value, label: title }) =>
                      value === title ? value : `${value} (${title})`,
                  )
                  .join(', ')}${more > 0 ? ` and ${more} more` : ''}.`
            : '',
        fieldType === 'checkbox'
            ? 'Checkbox values are separated by semicolons.'
            : '',
        type === 'string'
            ? "Text 'contains' matches whole words or part of one word."
            : '',
    ]
        .filter(Boolean)
        .join(' ');
};

/**
 * Labels by internal value for a dropdown whose labels differ from its
 * values, such as deal stages and ticket pipeline stages; none otherwise.
 */
const toValueLabels = ({
    type,
    options,
}: HubspotProperty): Record<string, string> | null => {
    if (type !== 'enumeration' || !options || options.length === 0) {
        return null;
    }
    return options.some(({ value, label }) => value !== label)
        ? Object.fromEntries(options.map(({ value, label }) => [value, label]))
        : null;
};

/** How to filter a label field: the labels it shows, which filters take. */
const hintLabels = (property: HubspotProperty) => {
    const options = property.options ?? [];
    const listed = PIPELINE_PROPERTIES.has(property.name)
        ? options
        : options.slice(0, MAX_LISTED_OPTIONS);
    const more = options.length - listed.length;
    return [
        `Filter with these labels: ${listed
            .map(({ label }) => label)
            .join(', ')}${more > 0 ? ` and ${more} more` : ''}.`,
        property.fieldType === 'checkbox'
            ? 'Checkbox values are separated by semicolons.'
            : '',
        `The raw field is renamed "${property.label} (internal value)".`,
    ]
        .filter(Boolean)
        .join(' ');
};

/**
 * Adds a dimension per property of the object, people's own before
 * HubSpot's hs_ ones. Unknown types and unreadable lists add nothing.
 */
export const withHubspotPropertyFields = (
    definition: LiveExploreDefinition,
    properties: unknown,
): LiveExploreDefinition => {
    const parsed = propertiesSchema.safeParse(properties);
    if (!parsed.success) {
        return definition;
    }
    const kept = parsed.data.results.filter(
        ({ name, type, hidden }) =>
            !hidden &&
            PROPERTY_NAME.test(name) &&
            !BUILT_IN_PROPERTIES.has(name) &&
            Object.hasOwn(PROPERTY_RULES, type),
    );
    const scanned = [
        ...kept.filter(({ name }) => !isInternalHubspotField(name)),
        ...kept.filter(({ name }) => isInternalHubspotField(name)),
    ].slice(0, MAX_SCANNED_PROPERTIES);
    const names = new Set([
        ...RESERVED_NAMES,
        ...scanned.map(({ name }) => toDimensionName(name)),
    ]);
    const dimensions = scanned.flatMap(
        (property): LiveDimensionDefinition[] => {
            const aiHint = hintProperty(property);
            const raw: LiveDimensionDefinition = {
                name: toDimensionName(property.name),
                apiName: property.name,
                label: property.label,
                description: describeProperty(property),
                ...(aiHint ? { aiHint } : {}),
                ...PROPERTY_RULES[property.type],
            };
            const labelName = `${raw.name}_label`;
            const valueLabels = toValueLabels(property);
            if (!valueLabels || names.has(labelName)) {
                return [raw];
            }
            names.add(labelName);
            return [
                {
                    ...raw,
                    // The label field takes HubSpot's own name for it
                    label: `${property.label} (internal value)`,
                },
                {
                    name: labelName,
                    apiName: `${property.name}${HUBSPOT_LABEL_SUFFIX}`,
                    label: property.label,
                    description: `${property.label} as HubSpot shows it, using the option's label rather than its internal value.`,
                    aiHint: hintLabels(property),
                    type: DimensionType.STRING,
                    filterOperators: HUBSPOT_CHOICE_FILTERS,
                    valueLabels,
                },
            ];
        },
    );
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
    };
};
