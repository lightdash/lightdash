import { getItemLabelWithoutTableName } from '@lightdash/common';
import { encode } from '@toon-format/toon';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';

export const convertQueryResultsToToon = (
    queryResults: Awaited<
        ReturnType<InstanceType<typeof ProjectService>['runMetricQuery']>
    >,
): string => {
    const fieldIds = queryResults.rows[0]
        ? Object.keys(queryResults.rows[0])
        : [];

    // Create field mapping for headers
    const fieldMapping: Record<string, string> = {};
    fieldIds.forEach((fieldId) => {
        const item = queryResults.fields[fieldId];
        fieldMapping[fieldId] = item
            ? getItemLabelWithoutTableName(item)
            : fieldId;
    });

    // Transform rows to use labeled keys
    const transformedRows = queryResults.rows.map((row) => {
        const transformedRow: Record<string, unknown> = {};
        Object.entries(row).forEach(([key, value]) => {
            const label = fieldMapping[key] || key;
            transformedRow[label] = value;
        });
        return transformedRow;
    });

    return encode(transformedRows);
};
