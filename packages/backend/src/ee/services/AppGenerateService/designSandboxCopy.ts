import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
    type AppVersionDesignSnapshot,
    type OrganizationDesignFileKind,
} from '@lightdash/common';
import { Sandbox } from 'e2b';
import type { Logger } from 'winston';
import type { OrganizationDesignModel } from '../../../models/OrganizationDesignModel';
import { designS3Key } from '../../../services/OrganizationDesignService/OrganizationDesignService';

/**
 * Sandbox layout the agent sees when a theme is applied. Subdirectories are
 * always present (even if empty) so the agent can write `@font-face` blocks
 * pointing at `/app/src/design/fonts/` without checking that the directory
 * exists.
 */
const DESIGN_DIR = '/app/src/design';
const KIND_DIRS: Record<OrganizationDesignFileKind, string | null> = {
    css: `${DESIGN_DIR}/css`,
    font: `${DESIGN_DIR}/fonts`,
    image: `${DESIGN_DIR}/images`,
    instruction: null, // instruction markdown is concatenated into the
    // system prompt, not written into the source tree.
};

export type DesignSandboxCopyResult = {
    filesCopied: number;
    cssEntrypoints: string[];
    imagePaths: string[];
    fontPaths: string[];
    instructionMarkdown: string;
    designSnapshot: AppVersionDesignSnapshot | null;
};

const EMPTY_RESULT: DesignSandboxCopyResult = {
    filesCopied: 0,
    cssEntrypoints: [],
    imagePaths: [],
    fontPaths: [],
    instructionMarkdown: '',
    designSnapshot: null,
};

const readS3ObjectAsBuffer = async (
    s3Client: S3Client,
    bucket: string,
    key: string,
): Promise<Buffer> => {
    const response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const body = response.Body;
    if (!body || typeof (body as NodeJS.ReadableStream).on !== 'function') {
        throw new Error(`Unexpected S3 response body type for key=${key}`);
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

/**
 * Copy the resolved theme's files into the data-app sandbox and return
 * metadata for the system-prompt assembly + version-resources snapshot.
 *
 * When `designUuid` is null (no theme picked and no org default), this is
 * a no-op that returns an empty result — the pipeline continues exactly
 * as it would for a no-theme app.
 *
 * The destination directory is reset on every call (`rm -rf` then
 * `mkdir -p`) so a switched theme can never leave stale files from a
 * previous version sitting on a warm sandbox.
 */
export async function copyDesignIntoSandbox(args: {
    sandbox: Sandbox;
    s3Client: S3Client;
    bucket: string;
    organizationDesignModel: OrganizationDesignModel;
    organizationUuid: string;
    designUuid: string | null;
    logger: Logger;
}): Promise<DesignSandboxCopyResult> {
    const {
        sandbox,
        s3Client,
        bucket,
        organizationDesignModel,
        organizationUuid,
        designUuid,
        logger,
    } = args;

    if (!designUuid) {
        return EMPTY_RESULT;
    }

    const design = await organizationDesignModel.findInOrganization(
        organizationUuid,
        designUuid,
    );
    if (!design) {
        // Design was deleted between enqueue and worker pickup. Treat as
        // untheme and continue — the FK ON DELETE SET NULL on apps.design_uuid
        // will catch up on the next read.
        logger.warn(
            `Theme ${designUuid} not found at pipeline run time; skipping copy`,
        );
        return EMPTY_RESULT;
    }

    // Reset-and-recreate the design tree. Idempotent and cheap on a warm
    // sandbox; avoids tracking "what was there before".
    await sandbox.commands.run(
        `rm -rf ${DESIGN_DIR} && mkdir -p ${DESIGN_DIR}/css ${DESIGN_DIR}/fonts ${DESIGN_DIR}/images`,
        { timeoutMs: 10_000 },
    );

    const cssEntrypoints: string[] = [];
    const imagePaths: string[] = [];
    const fontPaths: string[] = [];
    const instructionParts: string[] = [];
    let filesCopied = 0;

    /* eslint-disable no-await-in-loop */
    for (const file of design.files) {
        const key = designS3Key(
            organizationUuid,
            design.designUuid,
            file.fileUuid,
            file.filename,
        );
        const buffer = await readS3ObjectAsBuffer(s3Client, bucket, key);

        if (file.kind === 'instruction') {
            // Instruction markdown stays out of the source tree — it's
            // concatenated into /app/effective-skill.md so the agent reads
            // it once at boot, not as part of the file scan.
            instructionParts.push(buffer.toString('utf8'));
            filesCopied += 1;
        } else {
            const dir = KIND_DIRS[file.kind];
            if (!dir) {
                // Shouldn't happen — kind validation upstream guarantees one
                // of the four kinds. Be defensive in case of future schema
                // additions.
                logger.warn(
                    `Theme ${design.designUuid}: skipping unknown kind=${file.kind} filename=${file.filename}`,
                );
            } else {
                const sandboxPath = `${dir}/${file.filename}`;
                await sandbox.files.write(
                    sandboxPath,
                    buffer.buffer.slice(
                        buffer.byteOffset,
                        buffer.byteOffset + buffer.byteLength,
                    ) as ArrayBuffer,
                );

                if (file.kind === 'css') cssEntrypoints.push(sandboxPath);
                else if (file.kind === 'image') imagePaths.push(sandboxPath);
                else if (file.kind === 'font') fontPaths.push(sandboxPath);

                filesCopied += 1;
            }
        }
    }
    /* eslint-enable no-await-in-loop */

    // Free-text "extra instructions" from the theme editor join the uploaded
    // instruction files in the same effective-skill append slot. Service
    // normalises empty strings to null, so a truthy check is enough.
    if (design.extraInstructions) {
        instructionParts.push(design.extraInstructions);
    }

    const instructionMarkdown = instructionParts.join('\n\n---\n\n');

    logger.info(
        `Theme ${design.designUuid}: copied ${filesCopied} file(s) into sandbox (css=${cssEntrypoints.length}, fonts=${fontPaths.length}, images=${imagePaths.length}, instruction-bytes=${instructionMarkdown.length})`,
    );

    return {
        filesCopied,
        cssEntrypoints,
        imagePaths,
        fontPaths,
        instructionMarkdown,
        designSnapshot: {
            designUuid: design.designUuid,
            name: design.name,
            fileCount: design.files.length,
        },
    };
}
