import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { type DataAppThemeContext } from '@lightdash/common';
import type { Logger } from 'winston';
import type { OrganizationDesignModel } from '../../../models/OrganizationDesignModel';
import { designS3Key } from '../../../services/OrganizationDesignService/OrganizationDesignService';
import { contextFile, THEME_ASSET_CAP } from './appContext';

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

const EMPTY_THEME: DataAppThemeContext = {
    instructions: null,
    assets: [],
    skippedAssetCount: 0,
};

export async function readDesignForDownload(args: {
    s3Client: S3Client;
    bucket: string;
    organizationDesignModel: OrganizationDesignModel;
    organizationUuid: string;
    designUuid: string | null;
    logger: Logger;
}): Promise<DataAppThemeContext> {
    const {
        s3Client,
        bucket,
        organizationDesignModel,
        organizationUuid,
        designUuid,
        logger,
    } = args;

    if (!designUuid) {
        return EMPTY_THEME;
    }

    const design = await organizationDesignModel.findInOrganization(
        organizationUuid,
        designUuid,
    );
    if (!design) {
        logger.warn(
            `Theme ${designUuid} not found during download context build; returning empty theme`,
        );
        return EMPTY_THEME;
    }

    const instructionFiles = design.files.filter(
        (f) => f.kind === 'instruction',
    );
    const assetFiles = design.files.filter((f) => f.kind !== 'instruction');

    // Read instruction files first — always fetched regardless of asset cap
    const instructionParts: string[] = [];
    /* eslint-disable no-await-in-loop */
    for (const file of instructionFiles) {
        const key = designS3Key(
            organizationUuid,
            design.designUuid,
            file.fileUuid,
            file.filename,
        );
        const buffer = await readS3ObjectAsBuffer(s3Client, bucket, key);
        instructionParts.push(buffer.toString('utf8'));
    }
    /* eslint-enable no-await-in-loop */

    if (design.extraInstructions) {
        instructionParts.push(design.extraInstructions);
    }

    const assetCount = assetFiles.length;
    if (assetCount > THEME_ASSET_CAP) {
        logger.warn(
            `Theme ${design.designUuid}: ${assetCount} assets exceed cap of ${THEME_ASSET_CAP}; skipping all assets`,
        );
        instructionParts.push(
            `> **Note**: ${assetCount} theme asset(s) were skipped because they exceed the download cap of ${THEME_ASSET_CAP}.`,
        );
        const instructionText = instructionParts.join('\n\n---\n\n');
        return {
            instructions: contextFile('theme/instructions.md', instructionText),
            assets: [],
            skippedAssetCount: assetCount,
        };
    }

    // Read all asset buffers
    const assets = [];
    /* eslint-disable no-await-in-loop */
    for (const file of assetFiles) {
        const key = designS3Key(
            organizationUuid,
            design.designUuid,
            file.fileUuid,
            file.filename,
        );
        const buffer = await readS3ObjectAsBuffer(s3Client, bucket, key);
        assets.push(contextFile(`theme/assets/${file.filename}`, buffer));
    }
    /* eslint-enable no-await-in-loop */

    const instructions =
        instructionParts.length > 0
            ? contextFile(
                  'theme/instructions.md',
                  instructionParts.join('\n\n---\n\n'),
              )
            : null;

    return {
        instructions,
        assets,
        skippedAssetCount: 0,
    };
}
