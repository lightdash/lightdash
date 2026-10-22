import { type Knex } from 'knex';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
    type CompileBinding,
    type CompilePin,
    type CompileSlice,
} from '../../models/ProjectCompileModel';
import { type CrossSourceResolution } from '../../projectAdapters/crossSourceRefs';

export type PeerCompileContext = {
    projectUuid: string;
    compileJobUuid: string;
    slices: CompileSlice[];
    writeKind: 'all' | 'slices';
    pins: CompilePin[];
    bindings: CompileBinding[];
    artifacts: ((trx: Knex.Transaction) => Promise<void>)[];
};

export const peerCompileContext = new AsyncLocalStorage<
    PeerCompileContext | undefined
>();

export function recordPeerResolution<T>(
    resolution: CrossSourceResolution<T>,
    sourceUuid: (context: T) => string,
): void {
    const context = peerCompileContext.getStore();
    if (!context) return;
    const sources = new Map(
        resolution.results.map(({ task, result }) => [
            task.key,
            { sourceUuid: sourceUuid(task.context), result },
        ]),
    );
    sources.forEach(({ sourceUuid: uuid, result }) => {
        context.pins.push({
            sourceUuid: uuid,
            commitSha: result.commitSha ?? null,
            dbtProjectName: result.manifest.metadata.project_name ?? null,
            capturedAt: new Date().toISOString(),
            deployMetadata: null,
        });
    });
    (resolution.bindings ?? []).forEach((binding) => {
        const consumer = sources.get(binding.consumerKey);
        const provider = sources.get(binding.providerKey);
        if (!consumer || !provider) return;
        context.bindings.push({
            consumerSourceUuid: consumer.sourceUuid,
            consumerNodeId: binding.consumerNodeId,
            refPackage: binding.refPackage,
            refName: binding.refName,
            requestedVersion: binding.requestedVersion,
            providerSourceUuid: provider.sourceUuid,
            providerPackage: binding.providerPackage,
            providerName: binding.providerName,
            resolvedVersion: binding.resolvedVersion,
            providerCommitSha: provider.result.commitSha ?? null,
        });
    });
}
