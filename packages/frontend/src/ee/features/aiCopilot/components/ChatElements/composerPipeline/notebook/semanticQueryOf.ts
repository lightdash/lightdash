import { QuerySourceType, type SourceQuery } from '@lightdash/common';

export const semanticQueryOf = (query: SourceQuery) =>
    query.sourceType === QuerySourceType.SEMANTIC_LAYER ? query : null;
