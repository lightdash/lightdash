import { NotFoundError, type DbtManifest } from '@lightdash/common';
import { promisify } from 'node:util';
import { gunzip, gzip } from 'node:zlib';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import { describeDbtProjectMap } from './dbtProjectMap';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** The manifest a project's dbt compile read, or Semantic Studio patched on to a later commit, and that commit. */
export type CompiledDbtManifest = {
    commitSha: string;
    manifest: DbtManifest;
    /** The compile job whose explores the cache holds as this manifest compiles; null when it may hold others. */
    exploresJobUuid: string | null;
};

const fileId = (projectUuid: string) => `compiled-dbt-manifest/${projectUuid}`;
const projectMapFileId = (projectUuid: string) =>
    `compiled-dbt-project-map/${projectUuid}`;

/** The project's layout, summarised once per saved manifest so a prompt never reads the whole manifest. */
type StoredDbtProjectMap = { map: string | null };

export const saveCompiledDbtManifest = async (
    fileStorageClient: Pick<FileStorageClient, 'uploadTxt'>,
    projectUuid: string,
    compiled: CompiledDbtManifest,
): Promise<void> => {
    await fileStorageClient.uploadTxt(
        await gzipAsync(JSON.stringify(compiled)),
        fileId(projectUuid),
    );
    const stored: StoredDbtProjectMap = {
        map: describeDbtProjectMap(compiled.manifest),
    };
    await fileStorageClient.uploadTxt(
        Buffer.from(JSON.stringify(stored)),
        projectMapFileId(projectUuid),
    );
};

/** The layout summarised when the manifest was saved; null when none is stored, such as for a manifest saved before summaries were. */
export const readCompiledDbtProjectMap = async (
    fileStorageClient: Pick<FileStorageClient, 'getFileStream'>,
    projectUuid: string,
): Promise<StoredDbtProjectMap | null> => {
    try {
        const { stream } = await fileStorageClient.getFileStream(
            `${projectMapFileId(projectUuid)}.txt`,
        );
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const stored: Partial<StoredDbtProjectMap> = JSON.parse(
            Buffer.concat(chunks).toString('utf8'),
        );
        return typeof stored.map === 'string' || stored.map === null
            ? { map: stored.map }
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
        const compiled: Partial<CompiledDbtManifest> = JSON.parse(
            (await gunzipAsync(Buffer.concat(chunks))).toString('utf8'),
        );
        return typeof compiled.commitSha === 'string' &&
            compiled.manifest?.nodes
            ? {
                  commitSha: compiled.commitSha,
                  manifest: compiled.manifest,
                  exploresJobUuid: compiled.exploresJobUuid ?? null,
              }
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
