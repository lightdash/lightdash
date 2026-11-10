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
 *
 * Coverage is tracked explicitly (GLITCH-930): every present measurement is
 * counted as assessed, skipped, or excluded, and the note and limitation are
 * derived from those counts so partial assessment is never presented as a
 * complete verdict.
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

/**
 * Where every present measurement (row × metric; missing values excluded)
 * ended up. Invariant: total = assessed + skippedInsufficientHistory +
 * skippedZeroBaseline + excludedIncompleteToday.
 */
export type SeasonalityCoverage = {
    total: number;
    /** Scored against a computed weekday baseline. */
    assessed: number;
    /** In a weekday group with fewer than the minimum baseline samples. */
    skippedInsufficientHistory: number;
    /** In a weekday group whose median and MAD are both zero. */
    skippedZeroBaseline: number;
    /** On the run's own (incomplete) calendar day; never part of a baseline. */
    excludedIncompleteToday: number;
    /** Assessed measurements that broke their baseline. */
    flagged: number;
    /** Flagged deviations left unmarked by the marker cap. */
    omittedByMarkerCap: number;
};

export type SeasonalityPrePass = {
    /** Extra CSV column with one marker cell per row; null when nothing is flagged. */
    annotations: { header: string; cells: (string | null)[] } | null;
    /** Preamble line telling the model how far to trust the pre-pass. */
    note: string | null;
    /** Deterministic caveat to surface in the result's limitations. */
    limitation: string | null;
    /** Null when the pre-pass does not apply to the section at all. */
    coverage: SeasonalityCoverage | null;
};

const NO_PRE_PASS: SeasonalityPrePass = {
    annotations: null,
    note: null,
    limitation: null,
    coverage: null,
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

const plural = (count: number, noun: string): string =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

/** Skip reasons in note order; `forUsers` leaves out the routine today-exclusion. */
const describeSkips = (
    coverage: SeasonalityCoverage,
    forUsers: boolean,
): string[] => {
    const parts: string[] = [];
    if (coverage.skippedInsufficientHistory > 0) {
        parts.push(
            `${plural(
                coverage.skippedInsufficientHistory,
                'measurement',
            )} with fewer than ${MIN_SAMPLES_PER_WEEKDAY} same-weekday samples`,
        );
    }
    if (coverage.skippedZeroBaseline > 0) {
        parts.push(
            `${plural(
                coverage.skippedZeroBaseline,
                'measurement',
            )} against a zero baseline (zero median and zero MAD)`,
        );
    }
    if (!forUsers && coverage.excludedIncompleteToday > 0) {
        parts.push(
            `${plural(
                coverage.excludedIncompleteToday,
                'measurement',
            )} on today's incomplete day`,
        );
    }
    return parts;
};

const buildNote = (
    coverage: SeasonalityCoverage,
    hasMarkers: boolean,
): string => {
    const parts: string[] = [
        hasMarkers
            ? `Seasonality: the "${SEASONALITY_COLUMN_HEADER}" column holds deterministically pre-computed deviations from each row's own weekday baseline (median of the same weekday).`
            : `Seasonality: weekday baselines ${
                  coverage.assessed === 0
                      ? 'could not be computed for this section'
                      : 'were computed deterministically'
              }.`,
    ];
    const skips = describeSkips(coverage, false);
    const fullyCovered = coverage.assessed === coverage.total;
    if (fullyCovered && coverage.omittedByMarkerCap === 0) {
        parts.push(
            coverage.flagged === 0
                ? `All ${coverage.total} measurements were assessed; no row breaks its own weekday baseline.`
                : `All ${coverage.total} measurements were assessed; rows without a marker are within their normal weekly pattern.`,
        );
        return parts.join(' ');
    }
    if (!fullyCovered) {
        parts.push(
            `${coverage.assessed} of ${
                coverage.total
            } measurements were assessed; not assessed: ${skips.join(', ')}.`,
        );
    }
    if (coverage.omittedByMarkerCap > 0) {
        parts.push(
            `Only the ${MAX_MARKERS} strongest deviations are marked; ${plural(
                coverage.omittedByMarkerCap,
                'further flagged deviation',
            )} ${coverage.omittedByMarkerCap === 1 ? 'is' : 'are'} unmarked.`,
        );
    }
    parts.push(
        'Absence of a marker does not establish that a row is within its normal weekly pattern; treat unassessed and unmarked rows as unverified, not as normal and not as anomalous.',
    );
    return parts.join(' ');
};

const buildLimitation = (coverage: SeasonalityCoverage): string | null => {
    const parts: string[] = [];
    const skips = describeSkips(coverage, true);
    if (skips.length > 0) {
        parts.push(
            coverage.assessed === 0
                ? `Weekly seasonality was not assessed: ${skips.join(', ')}.`
                : `Weekly-seasonality assessment covered ${
                      coverage.assessed
                  } of ${
                      coverage.total - coverage.excludedIncompleteToday
                  } measurements; not assessed: ${skips.join(', ')}.`,
        );
    }
    if (coverage.omittedByMarkerCap > 0) {
        parts.push(
            `${plural(
                coverage.omittedByMarkerCap,
                'weekly-seasonality deviation',
            )} beyond the ${MAX_MARKERS}-marker cap ${
                coverage.omittedByMarkerCap === 1 ? 'is' : 'are'
            } not marked.`,
        );
    }
    return parts.length > 0 ? parts.join(' ') : null;
};

/**
 * Pure: same rows and `todayUtc` always produce the same markers, so the
 * annotated content hashes stay stable within a day.
 *
 * @param todayUtc the run's UTC calendar day (YYYY-MM-DD); rows on that day
 * are a trailing incomplete period, excluded from baselines and never flagged.
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
    const isToday = dates.map(
        (date) => (date as Date).toISOString().slice(0, 10) === todayUtc,
    );

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

    const coverage: SeasonalityCoverage = {
        total: 0,
        assessed: 0,
        skippedInsufficientHistory: 0,
        skippedZeroBaseline: 0,
        excludedIncompleteToday: 0,
        flagged: 0,
        omittedByMarkerCap: 0,
    };
    const flags: Flag[] = [];
    groups.forEach((rowIndexes) => {
        metricIds.forEach((fieldId) => {
            const present = rowIndexes
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
            coverage.total += present.length;
            // Today is a trailing incomplete period: no baseline membership,
            // no sample-count contribution, no flagging.
            const samples = present.filter(
                ({ rowIndex }) => !isToday[rowIndex],
            );
            coverage.excludedIncompleteToday += present.length - samples.length;
            if (samples.length < MIN_SAMPLES_PER_WEEKDAY) {
                coverage.skippedInsufficientHistory += samples.length;
                return;
            }
            const values = samples.map((s) => s.value).sort((a, b) => a - b);
            const groupMedian = median(values);
            const mad = median(
                samples
                    .map((s) => Math.abs(s.value - groupMedian))
                    .sort((a, b) => a - b),
            );
            // Relative deviations have no meaningful scale for this baseline.
            if (groupMedian === 0 && mad === 0) {
                coverage.skippedZeroBaseline += samples.length;
                return;
            }
            coverage.assessed += samples.length;
            samples.forEach(({ rowIndex, value }) => {
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
                        WEEKDAYS[(dates[rowIndex] as Date).getUTCDay()],
                    ),
                });
            });
        });
    });

    coverage.flagged = flags.length;
    coverage.omittedByMarkerCap = Math.max(0, flags.length - MAX_MARKERS);

    // Even at zero coverage the section keeps its note: the pre-pass owns
    // daily-row judgement wherever it applies, so the model never falls back
    // to flagging unassessed rows itself (the conservative skip).
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
        annotations:
            kept.length > 0
                ? { header: SEASONALITY_COLUMN_HEADER, cells }
                : null,
        note: buildNote(coverage, kept.length > 0),
        limitation: buildLimitation(coverage),
        coverage,
    };
};
