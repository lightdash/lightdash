import { isValidFormat } from 'numfmt';
import { UnexpectedServerError } from '../types/errors';
import {
    friendlyName,
    isDimension,
    isTableCalculation,
    type Item,
    type ItemsMap,
} from '../types/field';
import { type ParametersValuesMap } from '../types/parameters';
import { type ResultColumn } from '../types/results';
import { TimeFrames } from '../types/timeFrames';
import { evaluateConditionalFormatExpression } from './conditionalFormatExpressions';
import {
    formatExpressionHasParameters,
    getCustomFormat,
    getEffectiveSeparator,
    getFormatExpression,
    hasValidFormatExpression,
    shouldShiftItemTimezone,
} from './formatting';
import { getItemId, getItemLabel } from './item';

type ResultColumnMetadata = Omit<ResultColumn, 'reference' | 'type'>;

function assertItemMatchesFieldId(item: Item, fieldId: string): void {
    const itemId = getItemId(item);
    if (itemId !== fieldId) {
        throw new UnexpectedServerError(
            `Result column lookup for "${fieldId}" returned the item ` +
                `"${itemId}". Items maps must be keyed by getItemId; a map ` +
                `keyed any other way silently drops column metadata.`,
        );
    }
}

/**
 * Resolves the semantic item behind a result column from the query's items
 * map. Returns undefined when the map has no entry for the field id —
 * computed and raw SQL columns have no item, and consumers fall back to a
 * reference-derived label.
 *
 * Every well-behaved producer keys its items map by `getItemId`
 * (`getItemMap`, `compileMetricQuery`, `buildMergeItems`), so an entry whose
 * own field id differs from its key breaks that invariant and throws.
 * Failing loudly is the point: a silent skip would drop a real field's
 * label, format, and provenance with no error, and a silent accept would
 * stamp another field's metadata onto the column.
 */
export function getResultColumnSourceItem(
    itemsMap: ItemsMap | undefined,
    fieldId: string,
): Item | undefined {
    const item = itemsMap?.[fieldId];
    if (item === undefined) {
        return undefined;
    }
    assertItemMatchesFieldId(item, fieldId);
    return item;
}

/**
 * The display/format metadata a semantic item contributes to its result
 * column, resolved once at query-write time (docs/composer-viz-plan/01-design.md §3).
 *
 * Columns without an item get only a display label derived from the
 * reference with `friendlyName`; they never get provenance or a format.
 * Resolve the item with `getResultColumnSourceItem`: an item whose field id
 * differs from the column reference is a producer bug and throws.
 */
export function getResultColumnMetadataFromItem(
    item: Item | undefined,
    fieldId: string,
    parameters?: ParametersValuesMap | null,
): ResultColumnMetadata {
    if (!item) {
        return { label: friendlyName(fieldId) };
    }
    assertItemMatchesFieldId(item, fieldId);

    const metadata: ResultColumnMetadata = {
        label: getItemLabel(item),
    };

    // Table calcs, computed and raw SQL columns have no semantic field behind
    // them — absence of provenance gates interaction capabilities off.
    if (!isTableCalculation(item)) {
        metadata.provenance = { fieldId };
    }

    if (shouldShiftItemTimezone(item)) {
        metadata.shiftsTimezone = true;
    }

    if (isDimension(item) && item.timeInterval) {
        metadata.timeInterval = item.timeInterval;

        // Year numbers render as plain unseparated values (2021, never
        // 2,021) — formatItemValue short-circuits before any custom format,
        // so the column must carry neither an expression nor formatOptions.
        if (item.timeInterval === TimeFrames.YEAR_NUM) {
            return metadata;
        }
    }

    // Parameter placeholders resolve here, at column-build time, so the
    // stored format is self-contained (parameter values are fixed for the
    // lifetime of an execution). When values are missing or interpolation
    // leaves placeholders behind, omit the format entirely — never store an
    // un-interpolated placeholder, it throws at render.
    if (
        hasValidFormatExpression(item) &&
        formatExpressionHasParameters(item.format)
    ) {
        const interpolated = parameters
            ? evaluateConditionalFormatExpression(item.format, parameters)
            : undefined;
        if (
            interpolated !== undefined &&
            !formatExpressionHasParameters(interpolated) &&
            isValidFormat(interpolated)
        ) {
            metadata.format = interpolated;
            const separator = getEffectiveSeparator(item);
            if (separator) {
                metadata.separator = separator;
            }
        }
        return metadata;
    }

    const format = getFormatExpression(item);
    if (format) {
        metadata.format = format;
        const separator = getEffectiveSeparator(item);
        if (separator) {
            metadata.separator = separator;
        }
        return metadata;
    }

    // No expression form (dynamic AUTO compact, magnitude round, quarter or
    // sub-second grains) — carry the structured format as the escape hatch.
    const customFormat = getCustomFormat(item);
    if (customFormat) {
        metadata.formatOptions = customFormat;
    }
    return metadata;
}
