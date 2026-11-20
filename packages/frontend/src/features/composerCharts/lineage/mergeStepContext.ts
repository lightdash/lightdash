import { createContext, use } from 'react';
import { type PipelineNode } from './groupPipeline';

export type MergeStepContextValue = {
    nodesById: ReadonlyMap<string, PipelineNode>;
    onJump: (nodeId: string) => void;
    highlight: (nodeId: string | null) => void;
    highlightedNodeId: string | null;
    /** The step's letter, A for the first source; null for a node outside the merge. */
    markerOf: (nodeId: string) => string | null;
};

export const MergeStepContext = createContext<MergeStepContextValue | null>(
    null,
);

export const useMergeStep = () => {
    const value = use(MergeStepContext);
    if (!value) throw new Error('MergeStepProvider missing');
    return value;
};
