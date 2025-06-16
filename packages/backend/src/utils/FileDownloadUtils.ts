import {
    DimensionType,
    DownloadFileType,
    getItemLabel,
    getItemLabelWithoutTableName,
    isMomentInput,
    ItemsMap,
} from '@lightdash/common';
import moment, { MomentInput } from 'moment/moment';

export const isRowValueTimestamp = (
    value: unknown,
    field: { type: DimensionType },
): value is MomentInput =>
    isMomentInput(value) && field.type === DimensionType.TIMESTAMP;

export const isRowValueDate = (
    value: unknown,
    field: { type: DimensionType },
): value is MomentInput =>
    isMomentInput(value) && field.type === DimensionType.DATE;

export function sanitizeGenericFileName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, '_') // Replace non-alphanumeric characters with underscores
        .replace(/_{2,}/g, '_'); // Replace multiple underscores with a single one
}

export function generateGenericFileId({
    fileName,
    fileExtension = DownloadFileType.CSV,
    truncated = false,
    time = moment(),
}: {
    fileName: string;
    fileExtension: DownloadFileType;
    truncated: boolean;
    time: moment.Moment;
}): string {
    const timestamp = time.format('YYYY-MM-DD-HH-mm-ss-SSSS');
    const sanitizedFileName = sanitizeGenericFileName(fileName);
    const fileId = `${fileExtension}-${
        truncated ? 'incomplete_results-' : ''
    }${sanitizedFileName}-${timestamp}.${fileExtension}`;
    return fileId;
}

/**
 * Processes fields for file export, handling column ordering, filtering, and header generation
 * This utility is shared between CSV and Excel export services to avoid duplication
 */
export function processFieldsForExport(
    fields: ItemsMap,
    options: {
        showTableNames?: boolean;
        customLabels?: Record<string, string>;
        columnOrder?: string[];
        hiddenFields?: string[];
    },
) {
    const {
        showTableNames = false,
        customLabels = {},
        columnOrder = [],
        hiddenFields = [],
    } = options;

    // Filter out hidden fields and apply column ordering
    const availableFieldIds = Object.keys(fields).filter(
        (id) => !hiddenFields.includes(id),
    );

    const sortedFieldIds =
        columnOrder.length > 0
            ? [
                  ...columnOrder.filter((id) => availableFieldIds.includes(id)),
                  ...availableFieldIds.filter(
                      (id) => !columnOrder.includes(id),
                  ),
              ]
            : availableFieldIds;

    const headers = sortedFieldIds.map((fieldId) => {
        if (customLabels[fieldId]) {
            return customLabels[fieldId];
        }
        const item = fields[fieldId];
        if (!item) {
            return fieldId;
        }
        return showTableNames
            ? getItemLabel(item)
            : getItemLabelWithoutTableName(item);
    });

    return { sortedFieldIds, headers };
}
