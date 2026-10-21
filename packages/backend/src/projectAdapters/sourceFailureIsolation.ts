import {
    DbtError,
    getDbtManifestVersion,
    getExternalModelNodesFromManifest,
    isDbtRpcManifestResults,
    isSupportedDbtAdapter,
    type DbtManifest,
} from '@lightdash/common';
import { DbtSourceError } from '../dbt/DbtSourceError';
import Logger from '../logging/logger';
import { type ProjectModel } from '../models/ProjectModel/ProjectModel';
import {
    CompileInterruptedError,
    throwIfCompileAborted,
} from '../scheduler/compileShutdown';
import { DbtSourceDiskError } from './DbtSourceDiskPool';

export type SourceFailurePhase = 'prepare' | 'manifest' | 'dependency';

export const isFatalSourceFailure = (error: unknown): boolean => {
    if (error instanceof DbtSourceError)
        return isFatalSourceFailure(error.cause);
    if (
        error instanceof DbtError &&
        /found a cycle|cyclic dependency|ambiguous|ambiguity/i.test(
            [
                error.message,
                ...(error.logs ?? []).map((log) => log.info.msg),
            ].join(' '),
        )
    )
        return true;
    return (
        error instanceof CompileInterruptedError ||
        error instanceof DbtSourceDiskError ||
        (error instanceof Error &&
            ['AbortError', 'TimeoutError'].includes(error.name))
    );
};

export const validateDbtSourceManifest = (manifest: DbtManifest): void => {
    if (
        !isDbtRpcManifestResults({ manifest }) ||
        !isSupportedDbtAdapter(manifest.metadata)
    )
        throw new DbtError(
            'The dbt manifest is invalid or uses an unsupported adapter.',
        );
    getDbtManifestVersion(manifest);
    getExternalModelNodesFromManifest(manifest);
};

export class SourceFailureIsolation {
    readonly failedSourceUuids: string[] = [];

    readonly warnings: string[] = [];

    constructor(
        private readonly projectModel: ProjectModel,
        private readonly projectUuid: string,
        private readonly primarySourceUuid: string,
        private readonly onWarning: (warning: string) => Promise<void>,
    ) {}

    async skip(
        sourceUuid: string,
        sourceName: string,
        error: unknown,
        phase: SourceFailurePhase,
    ): Promise<boolean> {
        throwIfCompileAborted();
        if (
            sourceUuid === this.primarySourceUuid ||
            isFatalSourceFailure(error)
        )
            return false;
        if (this.failedSourceUuids.includes(sourceUuid)) return true;
        const carriedExploreCount =
            await this.projectModel.countCachedExploresForDbtSource(
                this.projectUuid,
                sourceUuid,
            );
        const reasons: Record<SourceFailurePhase, string> = {
            prepare: 'could not load the repository or install dbt packages',
            manifest: 'could not parse, list models, or validate the manifest',
            dependency: 'a referenced dbt source failed',
        };
        const warning = `Source "${sourceName}" failed: ${reasons[phase]}; ${carriedExploreCount > 0 ? `kept its ${carriedExploreCount} explores from the last successful refresh` : 'no explores from a previous successful refresh are available; nothing was carried'}.`;
        await this.onWarning(warning);
        this.failedSourceUuids.push(sourceUuid);
        this.warnings.push(warning);
        Logger.warn('dbt.compile.sourceSkipped', {
            event: 'dbt.compile.sourceSkipped',
            projectUuid: this.projectUuid,
            sourceUuid,
            reasonClass: phase,
            carriedExploreCount,
        });
        return true;
    }
}
