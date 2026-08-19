import { type WarehouseResults } from '@lightdash/common';
import { type ReadStream } from 'fs';
import { type PassThrough, type Readable } from 'stream';

/**
 * `contentDisposition` is the header stored on the object at upload time, which
 * carries the friendly download name. Null when the object has none.
 */
export type FileStreamResult = {
    stream: Readable;
    contentDisposition: string | null;
};

export interface FileStorageClient {
    readonly expirationDays: number | undefined;

    uploadPdf(
        pdf: Buffer,
        id: string,
    ): Promise<{ fileName: string; url: string }>;

    uploadTxt(txt: Buffer, id: string, expiresIn?: number): Promise<string>;

    uploadImage(
        image: Buffer,
        imageId: string,
        expiresIn?: number,
    ): Promise<string>;

    uploadCsv(
        csv: string,
        csvName: string,
        attachmentDownloadName?: string,
    ): Promise<string>;

    uploadZip(
        zip: ReadStream,
        zipName: string,
        attachmentDownloadName?: string,
    ): Promise<string>;

    uploadExcel(
        excel: ReadStream,
        excelName: string,
        attachmentDownloadName?: string,
    ): Promise<string>;

    streamResults(
        buffer: PassThrough,
        fileId: string,
    ): Promise<() => Promise<string>>;

    getFileStream(fileId: string): Promise<FileStreamResult>;

    createUploadStream(
        fileName: string,
        opts: { contentType: string },
        attachmentDownloadName?: string,
    ): {
        write: (rows: WarehouseResults['rows']) => Promise<void>;
        close: () => Promise<void>;
        writeStream: PassThrough;
    };

    getFileUrl(fileName: string, expiresIn?: number): Promise<string>;

    objectExists(fileName: string): Promise<boolean>;

    deleteFile(fileName: string): Promise<void>;

    isEnabled(): boolean;
}
