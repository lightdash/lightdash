import { NotFoundError, type DbtManifest } from '@lightdash/common';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** The manifest a project's dbt compile read, and the commit it was parsed at. */
export type CompiledDbtManifest = { commitSha: string; manifest: DbtManifest };

const fileId = (projectUuid: string) => `compiled-dbt-manifest/${projectUuid}`;

export const saveCompiledDbtManifest = async (
    fileStorageClient: Pick<FileStorageClient, 'uploadTxt'>,
    projectUuid: string,
    compiled: CompiledDbtManifest,
): Promise<void> => {
    await fileStorageClient.uploadTxt(
        await gzipAsync(JSON.stringify(compiled)),
        fileId(projectUuid),
    );
};

/** Null when none is stored, or what is stored cannot be read. */
export const readCompiledDbtManifest = async (
    fileStorageClient: Pick<FileStorageClient, 'getFileStream'>,
    projectUuid: string,
): Promise<CompiledDbtManifest | null> => {
    try {
        const { stream } = await fileStorageClient.getFileStream(
            `${fileId(projectUuid)}.txt`,
        );
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const compiled: CompiledDbtManifest = JSON.parse(
            (await gunzipAsync(Buffer.concat(chunks))).toString('utf8'),
        );
        return typeof compiled.commitSha === 'string' &&
            compiled.manifest?.nodes
            ? compiled
            : null;
    } catch (error) {
        if (
            error instanceof NotFoundError ||
            error instanceof SyntaxError ||
            (error instanceof Error && 'errno' in error)
        ) {
            return null;
        }
        throw error;
    }
};
