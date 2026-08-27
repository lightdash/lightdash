import { isValidFormat } from 'numfmt';
import {
    friendlyName,
    isDimension,
    isTableCalculation,
    type Item,
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

/**
 * The display/format metadata a semantic item contributes to its result
 * column, resolved once at query-write time (docs/composer-viz-plan/01-design.md §3).
 *
 * An item contributes metadata only when the column reference equals the
 * item's own field id. Raw SQL columns always fail that check:
 * `SqlQueryComposer` keys its virtual-view items `${table}_${column}` while
 * warehouse columns use unprefixed names. The check is intentional —
 * virtual-view dimensions are synthesized from probed columns, and marking
 * them as provenance would repeat the merge-path synthesized-field problem
 * (01-design.md §1) — so re-keying that map can never mark them as semantic
 * fields.
 *
 * A column with no semantic item gets only a display label derived from the
 * reference with `friendlyName`; it never gets provenance or a format.
 */
export function getResultColumnMetadataFromItem(
    item: Item | undefined,
    fieldId: string,
    parameters?: ParametersValuesMap | null,
): ResultColumnMetadata {
    if (!item || getItemId(item) !== fieldId) {
        return { label: friendlyName(fieldId) };
    }

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
