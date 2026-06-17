import { getItemLabelWithoutTableName, type ItemsMap } from '@lightdash/common';
import { stringify } from 'csv-stringify/sync';
import { CsvService } from '../../../../services/CsvService/CsvService';

export const convertQueryResultsToCsv = (queryResults: {
    rows: Record<string, unknown>[];
    fields: ItemsMap;
}): string => {
    const fieldIds = queryResults.rows[0]
        ? Object.keys(queryResults.rows[0])
        : [];

    const csvHeaders = fieldIds.map((fieldId) => {
        const item = queryResults.fields[fieldId];
        if (!item) {
            return fieldId;
        }
        return getItemLabelWithoutTableName(item);
    });

    const rows = queryResults.rows.map((row) =>
        CsvService.convertRowToCsv(row, queryResults.fields, true, fieldIds),
    );

    return stringify(rows, { header: true, columns: csvHeaders });
};
