import {
    DownloadFile,
    DownloadFileType,
    NotFoundError,
    ResultRow,
    SemanticLayerResultRow,
    UnexpectedServerError,
} from '@lightdash/common';
import * as fs from 'fs';
import { Knex } from 'knex';
import { nanoid } from 'nanoid';
import { PassThrough } from 'stream';
import { S3Client } from '../clients/Aws/s3';
import { DownloadFileTableName } from '../database/entities/downloadFile';
import Logger from '../logging/logger';

type DownloadFileModelArguments = {
    database: Knex;
};
export class DownloadFileModel {
    private database: Knex;

    constructor(args: DownloadFileModelArguments) {
        this.database = args.database;
    }

    async createDownloadFile(
        fileId: string,
        path: string,
        type: DownloadFileType,
    ): Promise<void> {
        await this.database(DownloadFileTableName).insert({
            nanoid: fileId,
            path,
            type,
        });
    }

    async getDownloadFile(fileId: string): Promise<DownloadFile> {
        const row = await this.database(DownloadFileTableName)
            .where('nanoid', fileId)
            .select('*')
            .first();

        if (row === undefined) {
            throw new NotFoundError(`Cannot find file`);
        }

        return {
            nanoid: row.nanoid,
            path: row.path,
            createdAt: row.created_at,
            type: row.type as DownloadFileType,
        };
    }

    async streamResultsToCloudStorage(
        urlPrefix: string,
        callback: (
            writer: (data: ResultRow | SemanticLayerResultRow) => void,
        ) => Promise<void>,
        s3Client?: S3Client,
    ): Promise<string> {
        const downloadFileId = nanoid();
        const passThrough = new PassThrough();
        const s3FileId = `${downloadFileId}.jsonl`;
        const endUpload = await s3Client!.streamResults(passThrough, s3FileId);
        try {
            const writer = (data: ResultRow | SemanticLayerResultRow) => {
                passThrough.write(`${JSON.stringify(data)}\n`);
            };

            await callback(writer);
        } catch (err) {
            Logger.error('Error during streaming', err);
            throw err;
        } finally {
            passThrough.end();
        }

        await endUpload();
        // Instead of returning the s3 signed URL to download,
        // we will store the fileId inside our downloadFile table
        // and serve the s3 stream from the backend on the sqlRunner/results endpoint
        await this.createDownloadFile(
            downloadFileId,
            s3FileId,
            DownloadFileType.S3_JSONL,
        );
        Logger.debug('File has been uploaded to S3.');

        const serverUrl = `${urlPrefix}/${downloadFileId}`;
        return serverUrl;
    }

    streamFunction(s3Client: S3Client) {
        return s3Client.isEnabled()
            ? this.streamResultsToCloudStorage.bind(this)
            : this.streamResultsToLocalFile.bind(this);
    }

    async streamResultsToLocalFile(
        urlPrefix: string,
        callback: (
            writer: (data: ResultRow | SemanticLayerResultRow) => void,
        ) => Promise<void>,
    ): Promise<string> {
        const downloadFileId = nanoid(); // Creates a new nanoid for the download file because the jobId is already exposed
        const filePath = `/tmp/${downloadFileId}.jsonl`;

        await this.createDownloadFile(
            downloadFileId,
            filePath,
            DownloadFileType.JSONL,
        );
        const writeStream = fs.createWriteStream(filePath, {
            encoding: 'utf8',
        });

        writeStream.on('error', (err) => {
            Logger.error('Error writing to file', err);
            throw new UnexpectedServerError('Error writing to file');
        });

        const writer = (data: ResultRow | SemanticLayerResultRow) => {
            writeStream.write(`${JSON.stringify(data)}\n`);
        };

        try {
            await callback(writer);
        } catch (err) {
            Logger.error('Error during streaming', err);
            throw err;
        } finally {
            writeStream.end(() => {
                Logger.debug('File has been saved.');
            });
        }

        const serverUrl = `${urlPrefix}/${downloadFileId}`;
        return serverUrl;
    }
}
