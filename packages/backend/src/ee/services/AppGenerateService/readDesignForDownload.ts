import { type S3Client } from '@aws-sdk/client-s3';
import {
    getThemeTotalBytes,
    MAX_THEME_TOTAL_BYTES,
    type DataAppThemeContext,
} from '@lightdash/common';
import type { Logger } from 'winston';
import type { OrganizationDesignModel } from '../../../models/OrganizationDesignModel';
import { designS3Key } from '../../../services/OrganizationDesignService/OrganizationDesignService';
import { contextFile } from './appContext';
import { readS3ObjectAsBuffer } from './s3Utils';

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
        return { instructions: null, assets: [], skippedAssetCount: 0 };
    }

    const design = await organizationDesignModel.findInOrganization(
        organizationUuid,
        designUuid,
    );
    if (!design) {
        logger.warn(
            `Theme ${designUuid} not found during download context build; returning empty theme`,
        );
        return { instructions: null, assets: [], skippedAssetCount: 0 };
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

    const assetBytes = getThemeTotalBytes(assetFiles);
    if (assetBytes > MAX_THEME_TOTAL_BYTES) {
        const mb = (n: number) => Math.round(n / (1024 * 1024));
        logger.warn(
            `Theme ${design.designUuid}: assets total ${mb(
                assetBytes,
            )} MB, exceed cap of ${mb(
                MAX_THEME_TOTAL_BYTES,
            )} MB; skipping all assets`,
        );
        instructionParts.push(
            `> **Note**: ${assetFiles.length} theme asset(s) (${mb(
                assetBytes,
            )} MB) were skipped because they exceed the download cap of ${mb(
                MAX_THEME_TOTAL_BYTES,
            )} MB.`,
        );
        const instructionText = instructionParts.join('\n\n---\n\n');
        return {
            instructions: contextFile('theme/instructions.md', instructionText),
            assets: [],
            skippedAssetCount: assetFiles.length,
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
