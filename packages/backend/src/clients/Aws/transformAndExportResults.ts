import { DownloadFileType, getErrorMessage } from '@lightdash/common';
import { Readable, Writable } from 'stream';
import Logger from '../../logging/logger';
import { S3ResultsFileStorageClient } from '../ResultsFileStorageClients/S3ResultsFileStorageClient';
import { S3Client } from './S3Client';
import getContentTypeFromFileType from './getContentTypeFromFileType';

/**
 * Transforms query results from the results bucket to the exports bucket.
 *
 * This utility handles the cross-bucket operation of:
 * 1. Reading JSONL query results from the results bucket (used for query caching)
 * 2. Transforming the data via a stream processor (e.g., JSONL → CSV/Excel)
 * 3. Writing the transformed file to the general exports bucket (for user downloads)
 *
 * @param sourceFileName - Name of the JSONL file in the results bucket (without extension)
 * @param destFileName - Name for the output file in the exports bucket (with extension)
 * @param streamProcessor - Function that transforms the read stream to write stream
 * @param clients - S3 clients for source and destination buckets
 * @param clients.resultsStorageClient - Client for results bucket (JSONL query cache)
 * @param clients.exportsStorageClient - Client for exports bucket (user downloads)
 * @param options - Optional configuration
 * @param options.fileType - Type of file being exported (determines MIME type)
 * @param options.attachmentDownloadName - Optional filename for Content-Disposition header
 * @returns Promise with the signed URL to the exported file and truncation status
 */
export async function transformAndExportResults(
    sourceFileName: string,
    destFileName: string,
    streamProcessor: (
        readStream: Readable,
        writeStream: Writable,
    ) => Promise<{ truncated: boolean }>,
    clients: {
        resultsStorageClient: S3ResultsFileStorageClient;
        exportsStorageClient: S3Client;
    },
    options?: {
        fileType: DownloadFileType;
        attachmentDownloadName?: string;
    },
): Promise<{ fileUrl: string; truncated: boolean }> {
    const { resultsStorageClient, exportsStorageClient } = clients;

    // Infer content type from file type
    const contentType = options?.fileType
        ? getContentTypeFromFileType(options.fileType)
        : 'text/csv'; // Default to CSV if not specified

    Logger.debug(
        `Transforming results from ${sourceFileName} to ${destFileName} with content type: ${contentType}`,
    );

    try {
        // Get the JSONL results stream from results bucket
        const resultsStream = await resultsStorageClient.getDownloadStream(
            sourceFileName,
        );

        // Create upload stream to exports bucket
        const { writeStream, close } =
            exportsStorageClient.createResultsExportUploadStream(
                destFileName,
                {
                    contentType,
                },
                options?.attachmentDownloadName,
            );

        // Process the stream transformation
        const { truncated } = await streamProcessor(resultsStream, writeStream);

        // Close the upload stream and wait for completion
        await close();

        // Get the signed URL for the exported file
        const fileUrl = await exportsStorageClient.getFileUrl(destFileName);

        Logger.debug(
            `Successfully transformed and exported ${sourceFileName} to ${destFileName}`,
        );

        return {
            fileUrl,
            truncated,
        };
    } catch (error) {
        Logger.error(
            `Failed to transform and export results from ${sourceFileName} to ${destFileName}: ${getErrorMessage(
                error,
            )}`,
        );
        throw error;
    }
}
