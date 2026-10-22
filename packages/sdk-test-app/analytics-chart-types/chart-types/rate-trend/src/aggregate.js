import { getFieldLabel, getFormatted, getRaw } from '@lightdash/query-sdk';

export const asFieldList = (binding) => {
    if (Array.isArray(binding)) return binding;
    return binding ? [binding] : [];
};

const toKey = (value) =>
    value === null || value === undefined ? '∅' : String(value);

const toNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
};

// Rows sorted by the raw value of a dimension, one entry per distinct value.
export const getDistinctValues = (rows, fieldId) => {
    const byKey = new Map();
    rows.forEach((row) => {
        const raw = getRaw(row, fieldId);
        const key = toKey(raw);
        if (!byKey.has(key)) {
            byKey.set(key, {
                key,
                raw,
                label: getFormatted(row, fieldId) || key,
            });
        }
    });
    return [...byKey.values()].sort((a, b) =>
        String(a.raw).localeCompare(String(b.raw), undefined, {
            numeric: true,
        }),
    );
};

const MONTH_LABEL = /^\d{4}-\d{2}$/;

// Month periods render as "Jan 24"; other grains keep their formatted label.
export const getPeriods = (rows, timeField) =>
    getDistinctValues(rows, timeField).map((period) => {
        const date = new Date(period.raw);
        if (!MONTH_LABEL.test(period.label) || Number.isNaN(date.getTime())) {
            return period;
        }
        return {
            ...period,
            label: date.toLocaleDateString(undefined, {
                month: 'short',
                year: '2-digit',
                timeZone: 'UTC',
            }),
        };
    });

// Sums each metric per (period, group); group is null for the overall view.
export const sumByPeriodAndGroup = ({
    rows,
    timeField,
    groupField,
    metricFields,
}) => {
    const sums = new Map();
    rows.forEach((row) => {
        const periodKey = toKey(getRaw(row, timeField));
        const groupKey = groupField ? toKey(getRaw(row, groupField)) : 'all';
        const key = `${periodKey}\u0000${groupKey}`;
        const current = sums.get(key) ?? metricFields.map(() => 0);
        metricFields.forEach((fieldId, index) => {
            current[index] += toNumber(getRaw(row, fieldId));
        });
        sums.set(key, current);
    });
    return (periodKey, groupKey = 'all') =>
        sums.get(`${periodKey}\u0000${groupKey}`) ?? null;
};

export const getBreakdownOptions = (context, breakdownFields) => [
    { id: 'overall', label: 'Overall' },
    ...breakdownFields.map((fieldId) => ({
        id: fieldId,
        label: `By ${getFieldLabel(context, fieldId).toLowerCase()}`,
    })),
];

// Reuses the currency/prefix symbol from the host-formatted value, e.g. "$".
export const getValuePrefix = (rows, fieldId) => {
    const sample = rows.length ? getFormatted(rows[0], fieldId) : '';
    return /^[^\d\s.,-]+/.exec(sample ?? '')?.[0] ?? '';
};

export const formatValue = (value, format, prefix = '') => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '–';
    }
    const type = format?.type;
    if (type === 'percent') {
        return `${(value * 100).toFixed(format?.round ?? 0)}%`;
    }
    const compact = new Intl.NumberFormat(undefined, {
        notation: Math.abs(value) >= 10000 ? 'compact' : 'standard',
        maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 1,
    }).format(value);
    if (type === 'currency' || type === 'usd') {
        return `${format?.prefix ?? '$'}${compact}`;
    }
    return `${format?.prefix ?? prefix}${compact}${format?.suffix ?? ''}`;
};

export const readToken = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();
