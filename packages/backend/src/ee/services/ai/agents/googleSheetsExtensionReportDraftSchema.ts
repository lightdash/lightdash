import { ParameterError, type Explore } from '@lightdash/common';
import { z } from 'zod';
import {
    type GenerateGoogleSheetsExtensionReportDraftRequest,
    type GoogleSheetsExtensionReportDraftFilter,
    type GoogleSheetsExtensionReportDraftSettings,
} from './googleSheetsExtensionReportDraftTypes';

const operators = [
    'equals',
    'notEquals',
    'include',
    'startsWith',
    'isNull',
    'notNull',
    'greaterThan',
    'greaterThanOrEqual',
    'lessThan',
    'lessThanOrEqual',
] as const;

const filterSchema = z
    .object({
        fieldId: z
            .string()
            .describe('An exact fieldId from the supplied metadata.'),
        operator: z.enum(operators),
        values: z.array(z.string()),
    })
    .strict();

// Keep the provider schema simple; enforce limits separately for all providers.
export const googleSheetsExtensionReportDraftSettingsSchema = z
    .object({
        rows: z
            .array(z.string())
            .describe(
                'Displayed dimensions, including numeric dimensions. Exact dimension fieldIds from metadata. Each field can appear in only one layout zone.',
            ),
        columns: z
            .array(z.string())
            .describe(
                'Exact dimension fieldIds to pivot into column headers. Empty for a flat table. Do not repeat fields from rows.',
            ),
        values: z
            .array(z.string())
            .describe(
                'Exact metric fieldIds only. A numeric dimension is still a dimension and belongs in rows or columns.',
            ),
        filters: z.array(filterSchema),
        sorts: z
            .array(
                z
                    .object({
                        fieldId: z
                            .string()
                            .describe(
                                'An exact fieldId selected in this report: from rows or values for a flat table, from rows only for a pivot or grouped report. No duplicate sorts.',
                            ),
                        descending: z.boolean(),
                    })
                    .strict(),
            )
            .describe(
                'Sort priority order. A ranking field must also be selected in the appropriate layout zone. Grouped reports must sort all rows in hierarchy order.',
            ),
        limit: z.number().int(),
        totals: z.object({ rows: z.boolean(), columns: z.boolean() }).strict(),
        groupRows: z.boolean(),
    })
    .strict();

export const googleSheetsExtensionReportDraftResponseSchema = z
    .object({
        status: z.enum(['ready', 'clarification', 'unsupported']),
        message: z.string(),
        report: googleSheetsExtensionReportDraftSettingsSchema.nullable(),
    })
    .strict();

const requestSchema = z
    .object({
        exploreName: z.string().min(1).max(500),
        prompt: z.string().trim().min(1).max(4000),
        current: googleSheetsExtensionReportDraftSettingsSchema,
        timezone: z.string().min(1).max(100),
        clarifications: z
            .array(
                z
                    .object({
                        prompt: z.string().max(4000),
                        message: z.string().max(2000),
                    })
                    .strict(),
            )
            .max(4),
        protectedFilters: z.array(filterSchema).max(50),
    })
    .strict();

export const parseGoogleSheetsExtensionReportDraftRequest = (
    payload: GenerateGoogleSheetsExtensionReportDraftRequest,
): GenerateGoogleSheetsExtensionReportDraftRequest => {
    const parsed = requestSchema.safeParse(payload);
    if (!parsed.success) {
        throw new ParameterError(
            'The report assistant request is invalid. Reopen the report and try again.',
        );
    }
    return parsed.data;
};

export const getGoogleSheetsExtensionReportDraftMetadata = (
    explore: Explore,
) => {
    const fields = Object.entries(explore.tables).flatMap(
        ([tableName, table]) =>
            [
                ...Object.values(table.dimensions).map((f) => ({
                    ...f,
                    kind: 'dimension' as const,
                })),
                ...Object.values(table.metrics).map((f) => ({
                    ...f,
                    kind: 'metric' as const,
                })),
            ]
                .filter((f) => !f.hidden)
                .map((f) => ({
                    fieldId: `${f.table}_${f.name}`,
                    label: f.label || f.name,
                    tableLabel: f.tableLabel || table.label || tableName,
                    kind: f.kind,
                    type: f.type,
                    description: f.description ?? null,
                })),
    );
    const seen = new Set<string>();
    const modelFilters = Object.entries(explore.tables).flatMap(
        ([tableName, table]) =>
            (table.requiredFilters ?? []).flatMap((rule) => {
                const ref = rule.target.fieldRef;
                const fieldId = ref.includes('.')
                    ? ref.replace(/\./g, '_')
                    : `${'tableName' in rule.target ? rule.target.tableName : tableName}_${ref}`;
                const key = `${fieldId}:${rule.operator}`;
                if (seen.has(key)) return [];
                seen.add(key);
                return [
                    {
                        fieldId,
                        operator: rule.operator,
                        values: (rule.values ?? []).map(String),
                        settings: 'settings' in rule ? rule.settings : null,
                        required: rule.required !== false,
                    },
                ];
            }),
    );
    return {
        explore: { name: explore.name, label: explore.label },
        fields,
        modelFilters,
    };
};

type GoogleSheetsExtensionReportMetadata = ReturnType<
    typeof getGoogleSheetsExtensionReportDraftMetadata
>;

export const sameGoogleSheetsExtensionReportFilter = (
    a: GoogleSheetsExtensionReportDraftFilter,
    b: GoogleSheetsExtensionReportDraftFilter,
): boolean =>
    a.fieldId === b.fieldId &&
    a.operator === b.operator &&
    JSON.stringify(a.values) === JSON.stringify(b.values);

const isDateValue = (value: string): boolean => {
    if (
        !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
            value,
        ) ||
        Number.isNaN(Date.parse(value))
    )
        return false;
    return (
        new Date(value.slice(0, 10)).toISOString().slice(0, 10) ===
        value.slice(0, 10)
    );
};

export const validateGoogleSheetsExtensionReportDraft = (
    input: GoogleSheetsExtensionReportDraftSettings,
    metadata: GoogleSheetsExtensionReportMetadata,
    current: GoogleSheetsExtensionReportDraftSettings | null,
): GoogleSheetsExtensionReportDraftSettings => {
    const parsed =
        googleSheetsExtensionReportDraftSettingsSchema.safeParse(input);
    if (!parsed.success)
        throw new ParameterError('The draft contains unsupported settings.');
    const report = parsed.data;
    const fields = new Map(
        metadata.fields.map((field) => [field.fieldId, field]),
    );
    // Report independent problems together so a correction can fix the whole
    // draft. Keep diagnostics free of field IDs, filter values and user input;
    // the generator may log them, and the model already has the draft/metadata.
    const errors: string[] = [];
    const selected = new Set<string>();
    (['rows', 'columns', 'values'] as const).forEach((zone) => {
        if (report[zone].length > 100)
            errors.push(`report.${zone} has too many fields (maximum 100).`);
        report[zone].forEach((id, index) => {
            const field = fields.get(id);
            const path = `report.${zone}[${index}]`;
            if (!field) {
                errors.push(
                    `${path} uses an unavailable field. Use an exact fieldId from the supplied metadata.`,
                );
            } else {
                const expectedKind = zone === 'values' ? 'metric' : 'dimension';
                if (field.kind !== expectedKind) {
                    errors.push(
                        `${path} is a misplaced ${field.kind}; ${zone} accepts only ${expectedKind} fields. Numeric dimensions are not metrics.`,
                    );
                }
            }
            if (selected.has(id)) {
                errors.push(
                    `${path} duplicates a field already selected. Each field can appear only once across rows, columns and values.`,
                );
            }
            selected.add(id);
        });
    });
    if (current && !selected.size)
        errors.push('The draft needs at least one field.');
    if (report.columns.length && !report.values.length)
        errors.push('Pivoting needs at least one metric.');
    if (report.limit < 1 || report.limit > 5000)
        errors.push('The row limit must be between 1 and 5000.');

    metadata.modelFilters
        .filter((filter) => filter.required)
        .forEach((required) => {
            const baseline = current?.filters.find(
                (filter) =>
                    filter.fieldId === required.fieldId &&
                    filter.operator === required.operator,
            );
            const values = baseline?.values ?? required.values;
            const matching = report.filters.filter(
                (filter) =>
                    filter.fieldId === required.fieldId &&
                    filter.operator === required.operator,
            );
            if (
                current &&
                matching.some(
                    (filter) =>
                        JSON.stringify(filter.values) !==
                        JSON.stringify(values),
                )
            ) {
                errors.push(
                    'The draft changed a required filter. Edit required filter values manually.',
                );
            }
            if (!matching.length) {
                const requiredFilter = filterSchema.safeParse({
                    fieldId: required.fieldId,
                    operator: required.operator,
                    values,
                });
                if (!requiredFilter.success) {
                    errors.push(
                        'This report has a required filter the assistant cannot handle. Edit it manually.',
                    );
                } else {
                    report.filters.push(requiredFilter.data);
                }
            }
        });
    if (report.filters.length > 50)
        errors.push('The draft has too many filters.');
    const equalValues = new Map<string, string[]>();
    report.filters.forEach((filter, index) => {
        const path = `report.filters[${index}]`;
        const field = fields.get(filter.fieldId);
        if (
            !field ||
            filter.values.length > 100 ||
            filter.values.some((v) => v.length > 1000)
        ) {
            errors.push(
                `${path} is an unsupported filter. Use an available field, at most 100 values and at most 1000 characters per value.`,
            );
            return;
        }
        const noValues = ['isNull', 'notNull'].includes(filter.operator);
        if (noValues ? filter.values.length !== 0 : !filter.values.length)
            errors.push(
                `${path} has missing or unexpected values. Use no values for isNull/notNull, and at least one value for other operators.`,
            );
        const numeric = field.kind === 'metric' || field.type === 'number';
        const date = field.type === 'date' || field.type === 'timestamp';
        const comparison = [
            'greaterThan',
            'greaterThanOrEqual',
            'lessThan',
            'lessThanOrEqual',
        ].includes(filter.operator);
        if (
            (comparison &&
                ((!numeric && !date) || filter.values.length !== 1)) ||
            (['include', 'startsWith'].includes(filter.operator) &&
                (numeric || date || field.type === 'boolean'))
        ) {
            errors.push(
                `${path} has a filter operator that does not match its field type or value count.`,
            );
        }
        if (
            filter.values.some(
                (value) =>
                    (numeric &&
                        (!value.trim() || !Number.isFinite(Number(value)))) ||
                    (field.type === 'boolean' &&
                        value !== 'true' &&
                        value !== 'false') ||
                    (date && !isDateValue(value)),
            )
        ) {
            errors.push(
                `${path} has a filter value that does not match its field type.`,
            );
        }
        if (current && filter.operator === 'equals') {
            const previous = equalValues.get(filter.fieldId);
            const intersection = previous
                ? previous.filter((v) => filter.values.includes(v))
                : filter.values;
            if (!intersection.length)
                errors.push(
                    `${path} contains conflicting filters for the same field. Alternative equals values belong in a single filter.`,
                );
            equalValues.set(filter.fieldId, intersection);
        }
    });
    const sorted = new Set<string>();
    if (report.sorts.length > 100)
        errors.push('report.sorts has too many sorts (maximum 100).');
    report.sorts.forEach((sort, index) => {
        const path = `report.sorts[${index}]`;
        if (sorted.has(sort.fieldId))
            errors.push(
                `${path} duplicates a sort. Sort each field only once.`,
            );
        sorted.add(sort.fieldId);
        if (!fields.has(sort.fieldId)) {
            errors.push(
                `${path}.fieldId uses an unavailable field. Copy an exact fieldId from metadata and select it in the report.`,
            );
            return;
        }
        if (!selected.has(sort.fieldId)) {
            errors.push(
                `${path}.fieldId is not selected in the report. Include a requested ranking dimension in rows or a ranking metric in values before sorting it. Using a field in filters does not select it.`,
            );
        }
        if (
            (report.columns.length || report.groupRows) &&
            !report.rows.includes(sort.fieldId)
        ) {
            errors.push(
                `${path} is an unsupported sort for this layout. Pivots and grouped reports can sort only dimensions selected in report.rows. Metric ranking requires a flat table (columns=[] and groupRows=false); if the requested layout requires a pivot or groups, return unsupported instead.`,
            );
        }
    });
    if (
        report.groupRows &&
        (report.rows.length < 2 ||
            report.rows.length > 9 ||
            report.sorts.length !== report.rows.length ||
            report.sorts.some(
                (sort, index) => sort.fieldId !== report.rows[index],
            ))
    ) {
        errors.push(
            'Grouped reports need 2–9 row dimensions sorted in hierarchy order: exactly one sort per report.rows field, in the same order.',
        );
    }
    if (
        (report.totals.rows &&
            (!report.columns.length || !report.values.length)) ||
        (report.totals.columns &&
            (!report.rows.length || !report.values.length))
    ) {
        errors.push('The draft totals do not match the report layout.');
    }
    if (errors.length) throw new ParameterError(errors.join('\n'));
    return report;
};
