import {
    queryReferenceToWireString,
    type DataAppQueryReference,
} from '@lightdash/common';

/** A query reference added to the chat from the lineage view. */
export type QueryRef = DataAppQueryReference & {
    /** Lineage pipeline it came from, so the notebook can mark it attached. */
    pipelineId: string;
    /** Notebook node id; single queries use the pipeline's terminal id. */
    pipelineNodeId: string;
};

/** Stable identity for dedupe and React keys. */
export const queryRefKey = (ref: QueryRef): string =>
    `${ref.pipelineId}:${ref.pipelineNodeId}`;

export const queryRefToWireString = (ref: QueryRef): string =>
    queryReferenceToWireString(ref);
