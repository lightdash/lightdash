import {
    DimensionType,
    MetricType,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import { z } from 'zod';
import {
    type LiveDimensionDefinition,
    type LiveExploreDefinition,
    type LiveMetricDefinition,
} from '../../sdk';
import { GA4_METRIC_FILTERS, GA4_STRING_FILTERS } from './filters';

const dimension = (
    name: string,
    apiName: string,
    label: string,
    description?: string,
    aiHint?: string,
): LiveDimensionDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type: DimensionType.STRING,
    filterOperators: GA4_STRING_FILTERS,
});

const metric = (
    name: string,
    apiName: string,
    label: string,
    type: MetricType,
    description?: string,
    format?: string,
    aggregation?: ApiSourceMetricAggregation,
    aiHint?: string,
): LiveMetricDefinition => ({
    name,
    apiName,
    label,
    description,
    ...(aiHint ? { aiHint } : {}),
    type,
    filterOperators: GA4_METRIC_FILTERS,
    ...(format ? { format } : {}),
    ...(aggregation ? { aggregation } : {}),
});

const metadataSchema = z.object({
    dimensions: z
        .array(
            z.object({
                apiName: z.string(),
                uiName: z.string().optional(),
                description: z.string().optional(),
                customDefinition: z.boolean().optional(),
            }),
        )
        .optional(),
    metrics: z
        .array(
            z.object({
                apiName: z.string(),
                uiName: z.string().optional(),
                description: z.string().optional(),
                customDefinition: z.boolean().optional(),
            }),
        )
        .optional(),
});

const SCANNED_METRIC_PREFIX = /^keyEvents:/;

/** Stable, SQL-friendly field name for a property-specific API name like `customEvent:plan`. */
const toScannedFieldName = (apiName: string) =>
    apiName
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[^A-Za-z0-9]+/g, '_')
        .toLowerCase();

/**
 * Adds the property's own fields from the GA4 Metadata API: custom dimensions
 * and metrics, and one key-event count per key event. Their rules are safe
 * defaults, since only the hand-written fields know more.
 */
export const withGa4MetadataFields = (
    definition: LiveExploreDefinition,
    metadata: unknown,
): LiveExploreDefinition => {
    const parsed = metadataSchema.safeParse(metadata);
    if (!parsed.success) {
        return definition;
    }
    const taken = new Set([
        ...definition.dimensions.map(({ name }) => name),
        ...definition.metrics.map(({ name }) => name),
    ]);
    const isNew = (name: string) => {
        if (taken.has(name)) {
            return false;
        }
        taken.add(name);
        return true;
    };
    const dimensions = (parsed.data.dimensions ?? [])
        .filter((field) => field.customDefinition)
        .map((field) =>
            dimension(
                toScannedFieldName(field.apiName),
                field.apiName,
                field.uiName ?? field.apiName,
                field.description,
                'Custom definitions get safe default rules; their scope (event, user or item) is not known to Lightdash.',
            ),
        )
        .filter(({ name }) => isNew(name));
    const metrics = (parsed.data.metrics ?? [])
        .filter(
            (field) =>
                field.customDefinition ||
                SCANNED_METRIC_PREFIX.test(field.apiName),
        )
        .map((field) =>
            metric(
                toScannedFieldName(field.apiName),
                field.apiName,
                field.uiName ?? field.apiName,
                MetricType.NUMBER,
                field.description,
                undefined,
                undefined,
                'Treated as non-additive: do not sum across rows.',
            ),
        )
        .filter(({ name }) => isNew(name));
    return {
        ...definition,
        dimensions: [...definition.dimensions, ...dimensions],
        metrics: [...definition.metrics, ...metrics],
    };
};
