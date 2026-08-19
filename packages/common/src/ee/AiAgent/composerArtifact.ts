import { type QueryNodeId, type SourceQuery } from '../../types/querySources';

/**
 * A composer query (multi-source pipeline) stored as a chart artifact. The
 * pipeline is stored replayable from day one; v0 rendering reads only the
 * terminal node's last result.
 */
export type AiComposerChartArtifactConfig = {
    source: 'composer';
    schemaVersion: 1;
    /** The replayable pipeline. Node ids are always pinned (resolved ids from submission). */
    queries: SourceQuery[];
    /** Which node's result this artifact shows. */
    terminalNodeId: QueryNodeId;
    /** Snapshot of the terminal node's last run; rendering v0 reads only this. */
    lastQueryUuid: string;
};

export const isAiComposerChartArtifactConfig = (
    config: unknown,
): config is AiComposerChartArtifactConfig =>
    typeof config === 'object' &&
    config !== null &&
    'source' in config &&
    config.source === 'composer' &&
    'schemaVersion' in config &&
    config.schemaVersion === 1 &&
    'queries' in config &&
    Array.isArray(config.queries) &&
    'terminalNodeId' in config &&
    typeof config.terminalNodeId === 'string' &&
    'lastQueryUuid' in config &&
    typeof config.lastQueryUuid === 'string';
