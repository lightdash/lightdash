import {
    formatRows,
    MAX_APP_VIZ_BUILD_SAMPLE_CELL_CHARS,
    MAX_APP_VIZ_BUILD_SAMPLE_FIELDS,
    MAX_APP_VIZ_BUILD_SAMPLE_ROWS,
    type ItemsMap,
} from '@lightdash/common';

/** Formatted sample rows keyed by field id, the shape Chart Studio sends. */
export const buildVizBuildSampleRows = (
    rows: Record<string, unknown>[],
    fields: ItemsMap,
    timezone: string | null,
): Record<string, string>[] => {
    const sampleRows = rows.slice(0, MAX_APP_VIZ_BUILD_SAMPLE_ROWS);
    const fieldIds = Object.keys(sampleRows[0] ?? {})
        .filter((fieldId) => fieldId.length > 0)
        .slice(0, MAX_APP_VIZ_BUILD_SAMPLE_FIELDS);

    return formatRows(
        sampleRows,
        fields,
        undefined,
        undefined,
        timezone ?? undefined,
    ).map((row) =>
        Object.fromEntries(
            fieldIds.flatMap((fieldId) => {
                const formatted = row[fieldId]?.value.formatted;
                return formatted === undefined
                    ? []
                    : [
                          [
                              fieldId,
                              formatted.slice(
                                  0,
                                  MAX_APP_VIZ_BUILD_SAMPLE_CELL_CHARS,
                              ),
                          ],
                      ];
            }),
        ),
    );
};
