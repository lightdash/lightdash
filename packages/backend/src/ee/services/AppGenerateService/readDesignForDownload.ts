import { type S3Client } from '@aws-sdk/client-s3';
import {
    getThemeTotalBytes,
    MAX_THEME_TOTAL_BYTES,
    type DataAppThemeContext,
} from '@lightdash/common';
import type { Logger } from 'winston';
import type { OrganizationDesignModel } from '../../../models/OrganizationDesignModel';
import {
    designS3Key,
    getEffectiveOrganizationDesignFiles,
} from '../../../services/OrganizationDesignService/OrganizationDesignService';
import {
    inspectThemeFileForBundling,
    omittedThemeFontGuidance,
    type RestrictedAppleFontMatch,
} from '../../../services/OrganizationDesignService/restrictedAppleFonts';
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

    const effectiveFiles = [
        ...getEffectiveOrganizationDesignFiles(design.files).values(),
    ];
    const instructionFiles = effectiveFiles.filter(
        (f) => f.kind === 'instruction',
    );
    const assetFiles = effectiveFiles.filter((f) => f.kind !== 'instruction');

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

    const fontFiles = assetFiles.filter((file) => file.kind === 'font');
    const nonFontAssetFiles = assetFiles.filter((file) => file.kind !== 'font');
    const includedFonts: { file: (typeof fontFiles)[number]; body: Buffer }[] =
        [];
    const omittedRestrictedFonts: RestrictedAppleFontMatch[] = [];

    // Inspect effective font files before applying the aggregate cap. A
    // restricted legacy font does not consume Data App download-context bytes.
    /* eslint-disable no-await-in-loop */
    for (const file of fontFiles) {
        const key = designS3Key(
            organizationUuid,
            design.designUuid,
            file.fileUuid,
            file.filename,
        );
        const buffer = await readS3ObjectAsBuffer(s3Client, bucket, key);
        const decision = await inspectThemeFileForBundling({
            file,
            body: buffer,
            designUuid: design.designUuid,
            logger,
        });
        if (decision.status === 'omit') {
            omittedRestrictedFonts.push(decision.match);
        } else {
            includedFonts.push({ file, body: buffer });
        }
    }
    /* eslint-enable no-await-in-loop */

    if (omittedRestrictedFonts.length > 0) {
        instructionParts.push(omittedThemeFontGuidance(omittedRestrictedFonts));
    }

    const assetBytes =
        getThemeTotalBytes(nonFontAssetFiles) +
        includedFonts.reduce((sum, { file }) => sum + file.sizeBytes, 0);
    if (assetBytes > MAX_THEME_TOTAL_BYTES) {
        const mb = (n: number) => Math.round(n / (1024 * 1024));
        const cappedAssetCount =
            nonFontAssetFiles.length + includedFonts.length;
        logger.warn(
            `Theme ${design.designUuid}: assets total ${mb(
                assetBytes,
            )} MB, exceed cap of ${mb(
                MAX_THEME_TOTAL_BYTES,
            )} MB; skipping all assets`,
        );
        instructionParts.push(
            `> **Note**: ${cappedAssetCount} theme asset(s) (${mb(
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

    const assets = includedFonts.map(({ file, body }) =>
        contextFile(`theme/assets/${file.filename}`, body),
    );
    /* eslint-disable no-await-in-loop */
    for (const file of nonFontAssetFiles) {
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
        skippedAssetCount: omittedRestrictedFonts.length,
    };
}
