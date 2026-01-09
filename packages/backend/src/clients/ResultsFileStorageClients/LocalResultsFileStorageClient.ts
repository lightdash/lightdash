import {
    getErrorMessage,
    MissingConfigError,
    type WarehouseResults,
} from '@lightdash/common';
import fs from 'fs';
import path from 'path';
import { PassThrough, type Readable } from 'stream';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import {
    type ResultsFileStorageClient,
    sanitizeResultsFileExtension,
} from './ResultsFileStorageClient';

type LocalResultsFileStorageClientArgs = {
    lightdashConfig: LightdashConfig;
};

export class LocalResultsFileStorageClient implements ResultsFileStorageClient {
    readonly type = 'local';

    private readonly basePath?: string;

    private readonly siteUrl: string;

    constructor({ lightdashConfig }: LocalResultsFileStorageClientArgs) {
        this.basePath = lightdashConfig.results.local?.path;
        this.siteUrl = lightdashConfig.siteUrl;

        if (this.basePath) {
            fs.mkdirSync(this.basePath, { recursive: true });
            Logger.debug(
                `Initialized local results storage at ${this.basePath}`,
            );
        }
    }

    get isEnabled() {
        return !!this.basePath;
    }

    private getBasePathOrThrow() {
        if (!this.basePath) {
            throw new MissingConfigError(
                'Local results storage path is not set',
            );
        }
        return this.basePath;
    }

    private static resolveFileName(fileName: string, fileExtension?: string) {
        const extensionFromName = path.extname(fileName).slice(1);
        const effectiveExtension =
            fileExtension || extensionFromName || 'jsonl';
        return sanitizeResultsFileExtension(fileName, effectiveExtension);
    }

    private resolveFilePath(fileName: string, fileExtension?: string) {
        const basePath = this.getBasePathOrThrow();
        const resolvedFileName = LocalResultsFileStorageClient.resolveFileName(
            fileName,
            fileExtension,
        );
        return path.join(basePath, resolvedFileName);
    }

    createUploadStream(
        fileName: string,
        _opts: {
            contentType: string;
        },
        _attachmentDownloadName?: string,
    ) {
        const filePath = this.resolveFilePath(fileName);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });

        const passThrough = new PassThrough();
        const fileStream = fs.createWriteStream(filePath);
        passThrough.pipe(fileStream);

        let isClosed = false;
        const close = async () => {
            if (isClosed) return;
            isClosed = true;
            try {
                passThrough.end();
                await new Promise<void>((resolve, reject) => {
                    fileStream.on('finish', () => resolve());
                    fileStream.on('error', reject);
                    passThrough.on('error', reject);
                });
            } catch (error) {
                Logger.error(
                    `Error closing local results stream for ${filePath}: ${getErrorMessage(
                        error,
                    )}`,
                );
                throw error;
            }
        };

        const write = (rows: WarehouseResults['rows']) => {
            try {
                rows.forEach((row) =>
                    passThrough.push(`${JSON.stringify(row)}\n`),
                );
            } catch (error) {
                Logger.error(
                    `Failed to write rows to fileName ${fileName}: ${getErrorMessage(
                        error,
                    )}`,
                );
                throw error;
            }
        };

        return { write, close, writeStream: passThrough };
    }

    async getDownloadStream(
        cacheKey: string,
        fileExtension?: string,
    ): Promise<Readable> {
        const filePath = this.resolveFilePath(cacheKey, fileExtension);

        if (!fs.existsSync(filePath)) {
            throw new Error(`Cache key ${cacheKey} not found`);
        }

        return fs.createReadStream(filePath);
    }

    async getFileUrl(cacheKey: string, fileExtension?: string) {
        const fileName = LocalResultsFileStorageClient.resolveFileName(
            cacheKey,
            fileExtension,
        );
        return new URL(`/api/v1/results/${fileName}`, this.siteUrl).href;
    }

    async uploadFile(
        fileName: string,
        filePath: string,
        _options: {
            contentType: string;
            attachmentDownloadName?: string;
        },
    ): Promise<string> {
        const destinationPath = this.resolveFilePath(fileName);
        fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
        await fs.promises.copyFile(filePath, destinationPath);
        const extension = path.extname(fileName).slice(1) || undefined;
        return this.getFileUrl(fileName, extension);
    }
}
