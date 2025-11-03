import { assertUnreachable, DownloadFileType } from '@lightdash/common';

export default function getContentTypeFromFileType(
    fileType: DownloadFileType,
): string {
    switch (fileType) {
        case DownloadFileType.CSV:
            return 'text/csv';
        case DownloadFileType.XLSX:
            return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case DownloadFileType.IMAGE:
            return 'image/png';
        case DownloadFileType.JSONL:
            return 'application/jsonl';
        case DownloadFileType.S3_JSONL:
            return 'application/jsonl';
        default:
            return assertUnreachable(
                fileType,
                `Unsupported file type: ${fileType}`,
            );
    }
}
