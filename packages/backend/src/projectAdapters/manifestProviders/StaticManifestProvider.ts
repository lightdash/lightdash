import {
    DbtError,
    DbtPackages,
    DbtRpcGetManifestResults,
    isDbtRpcManifestResults,
    UnexpectedServerError,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { ManifestProvider } from '../types';

export type StaticManifestProviderArgs = {
    /** Raw JSON string of the manifest */
    manifest: string;
};

/**
 * ManifestProvider implementation that uses a pre-provided manifest JSON string.
 * Useful for scenarios where the manifest is already available (e.g., from CLI deployment).
 */
export class StaticManifestProvider implements ManifestProvider {
    private readonly manifest: string;

    constructor({ manifest }: StaticManifestProviderArgs) {
        this.manifest = manifest;
    }

    async getManifest(): Promise<DbtRpcGetManifestResults> {
        if (!this.manifest) {
            throw new UnexpectedServerError(
                'Missing manifest in StaticManifestProvider',
            );
        }

        let parsedManifest: unknown;
        try {
            parsedManifest = JSON.parse(this.manifest);
        } catch (e) {
            throw new DbtError(
                'Cannot parse manifest JSON in StaticManifestProvider',
            );
        }

        const rawManifest = {
            manifest: parsedManifest,
        };

        if (isDbtRpcManifestResults(rawManifest)) {
            return rawManifest;
        }
        throw new DbtError(
            'Cannot read response from dbt, manifest.json not valid',
        );
    }

    // eslint-disable-next-line class-methods-use-this
    async getDbtPackages(): Promise<DbtPackages | undefined> {
        // Static manifest doesn't include packages.yml info
        return undefined;
    }

    // No installDeps needed - manifest is already provided

    // eslint-disable-next-line class-methods-use-this
    getSelector(): string | undefined {
        return undefined;
    }

    async test(): Promise<void> {
        // Validate that manifest can be parsed
        await this.getManifest();
    }

    // eslint-disable-next-line class-methods-use-this
    async destroy(): Promise<void> {
        Logger.debug('Destroy StaticManifestProvider');
        // Nothing to clean up
    }
}

/**
 * Factory function to create StaticManifestProvider
 */
export const createStaticManifestProvider = (
    args: StaticManifestProviderArgs,
): ManifestProvider => new StaticManifestProvider(args);
