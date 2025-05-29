import {
    DimensionType,
    DownloadFileType,
    isMomentInput,
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
