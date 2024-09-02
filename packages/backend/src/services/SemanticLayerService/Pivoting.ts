import {
    SemanticLayerPivot,
    SemanticLayerResultRow,
    SemanticLayerSortBy,
} from '@lightdash/common';
import pl from 'nodejs-polars';

export function pivotResults(
    results: SemanticLayerResultRow[],
    { values, ...options }: SemanticLayerPivot,
    sortBy?: SemanticLayerSortBy[],
): SemanticLayerResultRow[] {
    return pl.DataFrame(results).pivot(values, options).toRecords();
}
