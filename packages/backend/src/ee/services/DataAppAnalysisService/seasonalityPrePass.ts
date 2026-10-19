import {
    DimensionType,
    isDimension,
    TimeFrames,
    type ItemsMap,
} from '@lightdash/common';

/**
 * Deterministic weekly-seasonality pre-pass (GLITCH-924). Scores each
 * day-grain row against the median of its own weekday (within the same
 * combination of the section's other dimensions) so the detect model
 * describes pre-computed deviations instead of eyeballing raw rows.
 */

export const SEASONALITY_COLUMN_HEADER = 'Seasonality';

const MIN_SAMPLES_PER_WEEKDAY = 3;
// Robust z-score on (value − weekday median) / (1.4826 × MAD).
const Z_THRESHOLD = 3;
// Tiny spreads make z explode; a flag must also be a material deviation.
const MIN_RELATIVE_DEVIATION = 0.1;
// Constant baseline (MAD = 0): any z is infinite, so flag on size alone.
const MIN_RELATIVE_DEVIATION_ZERO_MAD = 0.5;
const MAX_MARKERS = 10;

const WEEKDAYS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
] as const;

export type SeasonalityPrePass = {
    /** Extra CSV column with one marker cell per row; null when nothing is flagged. */
    annotations: { header: string; cells: (string | null)[] } | null;
    /** Preamble line telling the model how to read (or trust) the pre-pass. */
    note: string | null;
    /** Deterministic caveat to surface in the result's limitations. */
    limitation: string | null;
};

const NO_PRE_PASS: SeasonalityPrePass = {
    annotations: null,
    note: null,
    limitation: null,
};

/** The one day-grain date dimension the weekly treatment keys on, or null. */
const findDayGrainField = (
    fields: ItemsMap,
    fieldIds: string[],
): string | null => {
    const candidates = fieldIds.filter((fieldId) => {
        const item = fields[fieldId];
        if (!item || !isDimension(item)) return false;
        if (item.timeInterval === TimeFrames.DAY) return true;
        // A raw DATE column is day grain; a raw TIMESTAMP's grain is unknown.
        return (
            item.type === DimensionType.DATE &&
            (item.timeInterval === undefined ||
                item.timeInterval === TimeFrames.RAW)
        );
    });
    return candidates.length === 1 ? candidates[0] : null;
};

const parseUtcDate = (value: unknown): Date | null => {
    if (value === null || value === undefined) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
};

const median = (sorted: number[]): number => {
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
};

const formatNumber = (value: number): string =>
    Number.isInteger(value) ? String(value) : value.toFixed(2);

const describeDeviation = (
    value: number,
    weekdayMedian: number,
    weekday: string,
): string => {
    const suffix = `typical ${weekday} (median ${formatNumber(weekdayMedian)})`;
    if (weekdayMedian > 0 && value > weekdayMedian) {
        return `${(value / weekdayMedian).toFixed(1)}× above ${suffix}`;
    }
    if (weekdayMedian > 0 && value >= 0) {
        return `${Math.round(
            (1 - value / weekdayMedian) * 100,
        )}% below ${suffix}`;
    }
    return `far ${value > weekdayMedian ? 'above' : 'below'} ${suffix}`;
};

type Flag = {
    rowIndex: number;
    fieldId: string;
    score: number;
    text: string;
};

/**
 * Pure: same rows and `todayUtc` always produce the same markers, so the
 * annotated content hashes stay stable within a day.
 *
 * @param todayUtc the run's UTC calendar day (YYYY-MM-DD); rows on that day
 * are a trailing incomplete period and are never flagged.
 */
export const seasonalityPrePass = (
    rows: Record<string, unknown>[],
    fields: ItemsMap,
    todayUtc: string,
): SeasonalityPrePass => {
    const fieldIds = rows[0] ? Object.keys(rows[0]) : [];
    const dateFieldId = findDayGrainField(fields, fieldIds);
    if (!dateFieldId || rows.length === 0) return NO_PRE_PASS;

    const dates = rows.map((row) => parseUtcDate(row[dateFieldId]));
    if (dates.some((date) => date === null)) return NO_PRE_PASS;

    const metricIds = fieldIds.filter((fieldId) => {
        const item = fields[fieldId];
        if (!item || isDimension(item)) return false;
        const values = rows
            .map((row) => row[fieldId])
            .filter(
                (value) =>
                    value !== null && value !== undefined && value !== '',
            );
        return (
            values.length > 0 &&
            values.every((value) => Number.isFinite(Number(value)))
        );
    });
    if (metricIds.length === 0) return NO_PRE_PASS;

    // Like-for-like: group by every other dimension plus day-of-week, so a
    // date × region section compares Saturdays within one region.
    const groupingIds = fieldIds.filter(
        (fieldId) =>
            fieldId !== dateFieldId &&
            !metricIds.includes(fieldId) &&
            (!fields[fieldId] || isDimension(fields[fieldId])),
    );
    const groups = new Map<string, number[]>();
    rows.forEach((row, rowIndex) => {
        const weekday = (dates[rowIndex] as Date).getUTCDay();
        const key = JSON.stringify([
            weekday,
            ...groupingIds.map((fieldId) => row[fieldId] ?? null),
        ]);
        groups.set(key, [...(groups.get(key) ?? []), rowIndex]);
    });

    const flags: Flag[] = [];
    let hadAssessableGroup = false;
    groups.forEach((rowIndexes) => {
        if (rowIndexes.length < MIN_SAMPLES_PER_WEEKDAY) return;
        hadAssessableGroup = true;
        metricIds.forEach((fieldId) => {
            const samples = rowIndexes
                .filter((rowIndex) => {
                    const value = rows[rowIndex][fieldId];
                    return (
                        value !== null && value !== undefined && value !== ''
                    );
                })
                .map((rowIndex) => ({
                    rowIndex,
                    value: Number(rows[rowIndex][fieldId]),
                }))
                .filter((sample) => Number.isFinite(sample.value));
            if (samples.length < MIN_SAMPLES_PER_WEEKDAY) return;
            const values = samples.map((s) => s.value).sort((a, b) => a - b);
            const groupMedian = median(values);
            const mad = median(
                samples
                    .map((s) => Math.abs(s.value - groupMedian))
                    .sort((a, b) => a - b),
            );
            samples.forEach(({ rowIndex, value }) => {
                const date = dates[rowIndex] as Date;
                if (date.toISOString().slice(0, 10) === todayUtc) return;
                const diff = Math.abs(value - groupMedian);
                const relative = diff / Math.max(Math.abs(groupMedian), 1e-9);
                const flagged =
                    mad > 0
                        ? diff / (1.4826 * mad) >= Z_THRESHOLD &&
                          relative >= MIN_RELATIVE_DEVIATION
                        : relative >= MIN_RELATIVE_DEVIATION_ZERO_MAD;
                if (!flagged) return;
                flags.push({
                    rowIndex,
                    fieldId,
                    score: mad > 0 ? diff / (1.4826 * mad) : relative * 100,
                    text: describeDeviation(
                        value,
                        groupMedian,
                        WEEKDAYS[date.getUTCDay()],
                    ),
                });
            });
        });
    });

    if (!hadAssessableGroup) {
        return {
            annotations: null,
            note: null,
            limitation: `Too little history to assess weekly seasonality (needs at least ${MIN_SAMPLES_PER_WEEKDAY} of each weekday)`,
        };
    }
    if (flags.length === 0) {
        return {
            annotations: null,
            note: 'Seasonality: weekday baselines were computed deterministically; no row breaks its own weekday baseline.',
            limitation: null,
        };
    }

    const kept = [...flags]
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_MARKERS);
    const cells: (string | null)[] = rows.map(() => null);
    kept.forEach(({ rowIndex, fieldId, text }) => {
        const marker = `${fieldId}: ${text}`;
        cells[rowIndex] =
            cells[rowIndex] === null ? marker : `${cells[rowIndex]}; ${marker}`;
    });
    return {
        annotations: { header: SEASONALITY_COLUMN_HEADER, cells },
        note: `Seasonality: the "${SEASONALITY_COLUMN_HEADER}" column holds deterministically pre-computed deviations from each row's own weekday baseline (median of the same weekday). Rows without a marker are within their normal weekly pattern.`,
        limitation: null,
    };
};
