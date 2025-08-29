import {
    AnyType,
    DbtManifest,
    DbtRpcGetManifestResults,
    isDbtRpcManifestResults,
    ParseError,
} from '@lightdash/common';
import Logger from '../../logging/logger';

/**
 * Validates a custom manifest JSON string and returns parsed manifest
 */
export const validateCustomManifest = (
    manifestJson: string,
): DbtRpcGetManifestResults => {
    try {
        const parsed = JSON.parse(manifestJson);

        // Check if it's a DbtManifest directly or wrapped in DbtRpcGetManifestResults format
        let manifestData: DbtManifest;

        if (isDbtRpcManifestResults({ manifest: parsed })) {
            // If it's already in the expected format
            manifestData = parsed as DbtManifest;
        } else if (isDbtRpcManifestResults(parsed)) {
            // If it's wrapped in the results format
            manifestData = parsed.manifest;
        } else {
            throw new ParseError(
                'Invalid manifest format: must be a valid dbt manifest.json with required fields (nodes, metadata, metrics)',
            );
        }

        const manifestResults: DbtRpcGetManifestResults = {
            manifest: manifestData,
        };

        // Validate using existing validation function
        if (!isDbtRpcManifestResults(manifestResults)) {
            throw new ParseError(
                'Invalid manifest structure: missing required fields or invalid metadata',
            );
        }

        Logger.info(
            `Custom manifest validated successfully. Found ${
                Object.keys(manifestData.nodes).length
            } nodes`,
        );

        return manifestResults;
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new ParseError('Invalid JSON format in custom manifest');
        }
        if (error instanceof ParseError) {
            throw error;
        }
        throw new ParseError(`Failed to validate custom manifest: ${error}`);
    }
};
