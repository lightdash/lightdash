import {
    DownloadFile,
    DownloadFileType,
    NotFoundError,
    ResultRow,
    UnexpectedServerError,
    type QueryResultProducer,
} from '@lightdash/common';
import * as fs from 'fs';
import { Knex } from 'knex';
import { nanoid } from 'nanoid';
import { text } from 'node:stream/consumers';
import { PassThrough } from 'stream';
import { type FileStorageClient } from '../clients/FileStorage/FileStorageClient';
import { DownloadFileTableName } from '../database/entities/downloadFile';
import Logger from '../logging/logger';

type DownloadFileModelArguments = {
    database: Knex;
};
export type DownloadFileProvenance = {
    version: 1;
    userUuid: string;
    organizationUuid: string;
    projectUuid: string;
    resultProducer: QueryResultProducer;
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
        projectUuid?: string,
    ): Promise<void> {
        await this.database(DownloadFileTableName).insert({
            nanoid: fileId,
            path,
            type,
            project_uuid: projectUuid ?? null,
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
            projectUuid: row.project_uuid,
        };
    }

    async getDownloadFileForProject(
        projectUuid: string,
        fileId: string,
    ): Promise<DownloadFile> {
        const row = await this.database(DownloadFileTableName)
            .where({
                nanoid: fileId,
                project_uuid: projectUuid,
            })
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
            projectUuid: row.project_uuid,
        };
    }

    async getProvenance(
        file: DownloadFile,
        fileStorageClient: FileStorageClient,
    ): Promise<DownloadFileProvenance | null> {
        try {
            const path = `${file.path}.provenance.txt`;
            let contents: string;
            if (file.type === DownloadFileType.S3_JSONL) {
                const { stream } = await fileStorageClient.getFileStream(path);
                contents = await text(stream);
            } else if (file.type === DownloadFileType.JSONL) {
                contents = await fs.promises.readFile(path, 'utf8');
            } else {
                return null;
            }
            const provenance: DownloadFileProvenance | null =
                JSON.parse(contents);
            return provenance?.version === 1 &&
                provenance.resultProducer?.version === 1
                ? provenance
                : null;
        } catch {
            return null;
        }
    }

    // TODO: consider removing this method in milestone #212
    async streamResultsToCloudStorage(
        urlPrefix: string,
        callback: (writer: (data: ResultRow) => void) => Promise<void>,
        fileStorageClient?: FileStorageClient,
        projectUuid?: string,
        provenance: DownloadFileProvenance | null = null,
    ): Promise<string> {
        const downloadFileId = nanoid();
        const passThrough = new PassThrough();
        const s3FileId = `${downloadFileId}.jsonl`;
        const endUpload = await fileStorageClient!.streamResults(
            passThrough,
            s3FileId,
        );
        try {
            const writer = (data: ResultRow) => {
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
        if (provenance) {
            await fileStorageClient!.uploadTxt(
                Buffer.from(JSON.stringify(provenance)),
                `${s3FileId}.provenance`,
            );
        }
        // Instead of returning the s3 signed URL to download,
        // we will store the fileId inside our downloadFile table
        // and serve the s3 stream from the backend on the sqlRunner/results endpoint
        await this.createDownloadFile(
            downloadFileId,
            s3FileId,
            DownloadFileType.S3_JSONL,
            projectUuid,
        );
        Logger.debug('File has been uploaded to S3.');

        const serverUrl = `${urlPrefix}/${downloadFileId}`;
        return serverUrl;
    }

    // TODO: consider removing in milestone #212
    streamFunction(
        fileStorageClient: FileStorageClient,
        projectUuid: string,
        provenance: DownloadFileProvenance | null = null,
    ) {
        return fileStorageClient.isEnabled()
            ? (
                  urlPrefix: string,
                  callback: (
                      writer: (data: ResultRow) => void,
                  ) => Promise<void>,
              ) =>
                  this.streamResultsToCloudStorage(
                      urlPrefix,
                      callback,
                      fileStorageClient,
                      projectUuid,
                      provenance,
                  )
            : (
                  urlPrefix: string,
                  callback: (
                      writer: (data: ResultRow) => void,
                  ) => Promise<void>,
              ) =>
                  this.streamResultsToLocalFile(
                      urlPrefix,
                      callback,
                      projectUuid,
                      provenance,
                  );
    }

    async streamResultsToLocalFile(
        urlPrefix: string,
        callback: (writer: (data: ResultRow) => void) => Promise<void>,
        projectUuid?: string,
        provenance: DownloadFileProvenance | null = null,
    ): Promise<string> {
        const downloadFileId = nanoid(); // Creates a new nanoid for the download file because the jobId is already exposed
        const filePath = `/tmp/${downloadFileId}.jsonl`;

        await this.createDownloadFile(
            downloadFileId,
            filePath,
            DownloadFileType.JSONL,
            projectUuid,
        );
        if (provenance) {
            await fs.promises.writeFile(
                `${filePath}.provenance.txt`,
                JSON.stringify(provenance),
            );
        }
        const writeStream = fs.createWriteStream(filePath, {
            encoding: 'utf8',
        });

        writeStream.on('error', (err) => {
            Logger.error('Error writing to file', err);
            throw new UnexpectedServerError('Error writing to file');
        });

        const writer = (data: ResultRow) => {
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
