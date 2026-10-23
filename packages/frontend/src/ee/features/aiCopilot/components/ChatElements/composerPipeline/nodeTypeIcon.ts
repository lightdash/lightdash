import {
    assertUnreachable,
    QuerySourceType,
    type SourceQuery,
} from '@lightdash/common';
import {
    IconBrandPython,
    IconDatabase,
    IconFileSpreadsheet,
    IconSitemap,
} from '@tabler/icons-react';

/** Icon for a node's type in the Queries tab; null for DuckDB transformations. */
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
            return null;
        default:
            return assertUnreachable(query, 'Unknown source type');
    }
};
