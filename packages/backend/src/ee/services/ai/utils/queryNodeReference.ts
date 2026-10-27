import { COMPOSER_NODE_ID_PATTERN } from '@lightdash/common';

const QUERY_NODE_REFERENCE_REGEX = new RegExp(
    `[ \\t]*\\[[^\\]\\n]*\\]\\(#query-node-${COMPOSER_NODE_ID_PATTERN}\\)`,
    'g',
);

/** Drops `[label](#query-node-<nodeId>)` references, label included, where they cannot open. */
export const stripQueryNodeReferences = (value: string): string =>
    value.replace(QUERY_NODE_REFERENCE_REGEX, '');
