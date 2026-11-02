/**
 * A query reference added from the lineage view: one query or pipeline node
 * of a data app, identified by the author id passed to `query().id()` /
 * `compose(id)` (null when the app never tagged it) and the node within it.
 */
export type DataAppQueryReference = {
    title: string;
    queryId: string | null;
    /** Pipeline node id; null for a single query. */
    nodeId: string | null;
};

/**
 * Bracket wire format the coding agent resolves, e.g.
 * `[query "Z-score spikes" id=breakout_months node=spikes]`, `[query "Total plays"]`.
 */
export const queryReferenceToWireString = ({
    title,
    queryId,
    nodeId,
}: DataAppQueryReference): string => {
    const parts = [
        `query "${title}"`,
        queryId !== null ? `id=${queryId}` : null,
        nodeId !== null ? `node=${nodeId}` : null,
    ].filter((part) => part !== null);
    return `[${parts.join(' ')}]`;
};
