// `[label](#query-node-<nodeId>)`, nodeId as the composer `query` tool's schema allows
const QUERY_NODE_REFERENCE_REGEX =
    /[ \t]*\[[^\]\n]*\]\(#query-node-[a-zA-Z_][a-zA-Z0-9_]{0,62}\)/g;

/** Drops query node references, label included, where they cannot open. */
export const stripQueryNodeReferences = (value: string): string =>
    value.replace(QUERY_NODE_REFERENCE_REGEX, '');
