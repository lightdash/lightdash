import {
    DbtError,
    DbtRpcGetManifestResults,
    isDbtRpcManifestResults,
    SupportedDbtVersions,
    UnexpectedServerError,
} from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { type Readable } from 'stream';
import { parser } from 'stream-json';
import Assembler from 'stream-json/Assembler';
import { filter } from 'stream-json/filters/Filter';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { type FileStorageClient } from '../clients/FileStorage/FileStorageClient';
import { CachedWarehouse, DbtClient } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

// The only top-level manifest keys Lightdash uses. Everything else (macros,
// sources, exposures, parent/child maps, etc.) is dropped while streaming so
// large multi-repo combined manifests stay within memory.
const MANIFEST_KEYS_FILTER = /^(nodes|metadata|metrics|docs)(\.|$)/;

export type ManifestSource =
    | { type: 'inline'; manifest: string }
    | { type: 's3'; s3Path: string; fileStorageClient: FileStorageClient };

// Stream-parse the manifest, assembling only the keys we need. The full
// document is never held as a single string or fully-materialised object.
const streamReducedManifest = async (
    stream: Readable,
): Promise<Record<string, unknown>> => {
    const tokens = stream
        .pipe(parser())
        .pipe(filter({ filter: MANIFEST_KEYS_FILTER }));
    const assembler = Assembler.connectTo(tokens);

    await new Promise<void>((resolve, reject) => {
        tokens.on('end', () => resolve());
        stream.on('error', reject);
        tokens.on('error', reject);
    });

    const assembled = (assembler.current ?? {}) as Record<string, unknown>;
    return {
        nodes: assembled.nodes ?? {},
        metadata: assembled.metadata ?? {},
        metrics: assembled.metrics ?? {},
        docs: assembled.docs ?? {},
    };
};

// Dummy dbt client that doesn't actually run dbt commands
class ManifestDbtClient implements DbtClient {
    private readonly source: ManifestSource;

    constructor(source: ManifestSource) {
        this.source = source;
    }

    // eslint-disable-next-line class-methods-use-this
    async test(): Promise<void> {
        // No dbt client to test for manifest-based projects
    }

    async getDbtManifest(): Promise<DbtRpcGetManifestResults> {
        let manifest: unknown;
        if (this.source.type === 's3') {
            const stream = await this.source.fileStorageClient.getFileStream(
                this.source.s3Path,
            );
            manifest = await streamReducedManifest(stream);
        } else {
            if (!this.source.manifest) {
                throw new UnexpectedServerError(
                    'Missing manifest on manifest project adapter',
                );
            }
            manifest = JSON.parse(this.source.manifest);
        }

        const rawManifest = { manifest };
        if (isDbtRpcManifestResults(rawManifest)) {
            return rawManifest;
        }
        throw new DbtError(
            'Cannot read response from dbt, manifest.json not valid',
        );
    }

    // eslint-disable-next-line class-methods-use-this
    getSelector(): string | undefined {
        return undefined;
    }
}

type DbtManifestProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    analytics?: LightdashAnalytics;
    source: ManifestSource;
};

export class DbtManifestProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        warehouseClient,
        cachedWarehouse,
        dbtVersion,
        analytics,
        source,
    }: DbtManifestProjectAdapterArgs) {
        // Create a dummy dbt client since we don't need it for manifest-based compilation
        const manifestDbtClient = new ManifestDbtClient(source);

        super(
            manifestDbtClient,
            warehouseClient,
            cachedWarehouse,
            dbtVersion,
            undefined, // no dbt project dir
            analytics,
        );
    }
}
