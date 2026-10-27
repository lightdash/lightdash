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

// Tabler has no DuckDB icon; this is the DuckDB mark (a circle and a bill) in outline.
const IconDuckdb = createReactComponent('duckdb', 'IconDuckdb', [
    ['path', { d: 'M3 12a5 5 0 1 0 10 0a5 5 0 1 0 -10 0', key: 'svg-0' }],
    ['path', { d: 'M15.5 9h2.5a3 3 0 0 1 0 6h-2.5z', key: 'svg-1' }],
]);

/** Icon for a node's type in the Queries tab. */
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
