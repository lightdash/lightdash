import { type WarehouseResults } from '@lightdash/common';
import { type Readable, type Writable } from 'stream';

export type ResultsFileStorageStream = {
    write: (rows: WarehouseResults['rows']) => void;
    close: () => Promise<void>;
    writeStream: Writable;
};

export type ResultsFileStorageClient = {
    type: 's3' | 'local';
    isEnabled: boolean;
    createUploadStream: (
        fileName: string,
        opts: {
            contentType: string;
        },
        attachmentDownloadName?: string,
    ) => ResultsFileStorageStream;
    getDownloadStream: (
        cacheKey: string,
        fileExtension?: string,
    ) => Promise<Readable>;
    getFileUrl: (cacheKey: string, fileExtension?: string) => Promise<string>;
    uploadFile?: (
        fileName: string,
        filePath: string,
        options: {
            contentType: string;
            attachmentDownloadName?: string;
        },
    ) => Promise<string>;
};

export const sanitizeResultsFileExtension = (
    fileName: string,
    fileExtension: string = 'jsonl',
): string => {
    const normalizedExtension = fileExtension.toLowerCase();
    const normalizedFileName = fileName.toLowerCase();
    const hasExtension = normalizedFileName.endsWith(`.${normalizedExtension}`);
    return hasExtension ? fileName : `${fileName}.${fileExtension}`;
};
