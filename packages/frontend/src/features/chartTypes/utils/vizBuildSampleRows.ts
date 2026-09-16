import { type DataAppVizContext } from '@lightdash/common';

const MAX_VIZ_BUILD_SAMPLE_ROWS = 10;
const MAX_VIZ_BUILD_SAMPLE_FIELDS = 20;

/** Take the rows already shown by the host, prioritizing mapped chart fields. */
export const vizBuildSampleRows = (
    rows: DataAppVizContext['rows'],
    fieldMapping: DataAppVizContext['fieldMapping'] = {},
): Record<string, string>[] => {
    const fields = [
        ...new Set([
            ...Object.values(fieldMapping),
            ...Object.keys(rows[0] ?? {}),
        ]),
    ]
        .filter((field) => field.length > 0)
        .slice(0, MAX_VIZ_BUILD_SAMPLE_FIELDS);

    return rows.slice(0, MAX_VIZ_BUILD_SAMPLE_ROWS).map((row) =>
        Object.fromEntries(
            fields.flatMap((field) => {
                const formatted = row[field]?.value.formatted;
                return formatted === undefined ? [] : [[field, formatted]];
            }),
        ),
    );
};
