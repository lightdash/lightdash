import {
    assertUnreachable,
    QuerySourceType,
    type SourceQuery,
} from '@lightdash/common';
import {
    createReactComponent,
    IconBrandPython,
    IconDatabase,
    IconFileSpreadsheet,
    IconSitemap,
} from '@tabler/icons-react';

// Tabler has no DuckDB icon; this is the DuckDB mark (head, eye, bill) in outline.
const IconDuckdb = createReactComponent('duckdb', 'IconDuckdb', [
    ['path', { d: 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', key: 'svg-0' }],
    ['path', { d: 'M7 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0', key: 'svg-1' }],
    ['path', { d: 'M14 10.5h3a1.5 1.5 0 0 1 0 3h-3z', key: 'svg-2' }],
]);

/** Icon for a node's type in the lineage. */
export const nodeTypeIcon = (query: SourceQuery) => {
    switch (query.sourceType) {
        case QuerySourceType.SEMANTIC_LAYER:
            return IconSitemap;
        case QuerySourceType.SQL:
            return IconDatabase;
        case QuerySourceType.EXTERNAL:
            return IconFileSpreadsheet;
        case QuerySourceType.PYTHON:
            return IconBrandPython;
        case QuerySourceType.DUCKDB:
            return IconDuckdb;
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};
