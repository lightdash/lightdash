import { isDimension, isTableCalculation, type Item } from '../types/field';
import { type ResultColumn } from '../types/results';
import { TimeFrames } from '../types/timeFrames';
import {
    formatExpressionHasParameters,
    getCustomFormat,
    getEffectiveSeparator,
    getFormatExpression,
    hasValidFormatExpression,
    shouldShiftItemTimezone,
} from './formatting';
import { getItemLabel } from './item';

type ResultColumnMetadata = Omit<ResultColumn, 'reference' | 'type'>;

/**
 * The display/format metadata a semantic item contributes to its result
 * column, resolved once at query-write time (docs/composer-viz-plan/01-design.md §3).
 * Returns an empty object for columns with no item behind them, so callers can
 * spread it unconditionally.
 */
export function getResultColumnMetadataFromItem(
    item: Item | undefined,
    fieldId: string,
): ResultColumnMetadata {
    if (!item) return {};

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

    // Parameter-dependent expressions are not self-contained: resolved
    // parameter values are not persisted on query history, so the queue
    // execution path cannot interpolate them. Omit the format entirely
    // rather than store a placeholder that renders wrong.
    if (
        hasValidFormatExpression(item) &&
        formatExpressionHasParameters(item.format)
    ) {
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
